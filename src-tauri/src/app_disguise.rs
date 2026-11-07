//! Desktop half of app disguise (Android: AppDisguise.kt, iOS: the
//! ios-app-disguise plugin). Only Windows is implemented; the commands exist
//! on every desktop build so the frontend can call them unconditionally.
//!
//! On Windows the decoy covers every place the shell shows the app before
//! (or while) it is open:
//! - the window title and its titlebar/taskbar/Alt+Tab icon,
//! - Start menu and desktop shortcuts (renamed + re-iconed) and taskbar pins
//!   (re-iconed only — renaming a pin unpins it on some builds),
//! - the toast header, via the AppUserModelId registration that Windows
//!   reads the display name/icon from,
//! - the "Installed apps" entry's name and icon.
//!
//! The choice is per Windows user, shared by the manager and every child
//! instance, and is re-applied on each launch because an update re-writes
//! the uninstall entry and window icon from the installer's defaults.

pub const DEFAULT: &str = "default";

#[derive(Debug, PartialEq, Eq)]
#[cfg_attr(not(windows), allow(dead_code))]
struct Preset {
    id: &'static str,
    /// Same names as the Android aliases (strings.xml disguise_name_*).
    name: &'static str,
    ico: &'static [u8],
    png: &'static [u8],
}

const PRESETS: &[Preset] = &[
    Preset {
        id: "calculator",
        name: "Calculator",
        ico: include_bytes!("../icons/disguise/calculator.ico"),
        png: include_bytes!("../icons/disguise/calculator.png"),
    },
    Preset {
        id: "notes",
        name: "Notes",
        ico: include_bytes!("../icons/disguise/notes.ico"),
        png: include_bytes!("../icons/disguise/notes.png"),
    },
    Preset {
        id: "weather",
        name: "Weather",
        ico: include_bytes!("../icons/disguise/weather.ico"),
        png: include_bytes!("../icons/disguise/weather.png"),
    },
];

fn preset(id: &str) -> Option<&'static Preset> {
    PRESETS.iter().find(|preset| preset.id == id)
}

/// The active disguise id ("default" when none).
#[tauri::command]
pub fn app_disguise_get() -> String {
    #[cfg(windows)]
    return imp::active().map_or(DEFAULT, |preset| preset.id).to_owned();
    #[cfg(not(windows))]
    DEFAULT.to_owned()
}

#[tauri::command]
pub async fn app_disguise_set(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let chosen = if id == DEFAULT {
        None
    } else {
        Some(preset(&id).ok_or_else(|| format!("unknown disguise {id}"))?)
    };
    #[cfg(windows)]
    return imp::select(&app, chosen);
    #[cfg(not(windows))]
    {
        let _ = (app, chosen);
        Err("app disguise is not available on this platform".to_owned())
    }
}

/// Re-applies the persisted disguise to the main window right away and to
/// the shell in the background. Called once from setup.
pub fn restore(app: &tauri::AppHandle) {
    #[cfg(windows)]
    imp::restore(app);
    #[cfg(not(windows))]
    let _ = app;
}

#[cfg(windows)]
mod imp {
    use std::fs;
    use std::io::ErrorKind;
    use std::path::{Path, PathBuf};

    use tauri::{AppHandle, Manager};
    use windows::core::{Interface, GUID, HSTRING, PCWSTR};
    use windows::Win32::Storage::EnhancedStorage::PKEY_AppUserModel_ID;
    use windows::Win32::System::Com::StructuredStorage::PropVariantToStringAlloc;
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize, IPersistFile,
        CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED, STGM_READWRITE,
    };
    use windows::Win32::UI::Shell::PropertiesSystem::IPropertyStore;
    use windows::Win32::UI::Shell::{
        FOLDERID_Desktop, FOLDERID_Programs, FOLDERID_UserPinned, IShellLinkW, SHChangeNotify,
        SHGetKnownFolderPath, ShellLink, KF_FLAG_DEFAULT, SHCNE_ASSOCCHANGED, SHCNE_ID,
        SHCNE_RENAMEITEM, SHCNE_UPDATEITEM, SHCNF_IDLIST, SHCNF_PATHW,
    };
    use windows_registry::CURRENT_USER;

    use super::{preset, Preset};

    const STATE_FILE: &str = "current";
    /// Shortcuts we renamed, for the uninstaller to delete
    /// (installer-hooks.nsh) — it only knows "<productName>.lnk".
    const SHORTCUTS_KEY: &str = "Disguise";

    fn state_dir() -> PathBuf {
        crate::windows_instance::windows_app_data_root_dir()
            .join("free-grind")
            .join("disguise")
    }

    pub(super) fn active() -> Option<&'static Preset> {
        let id = fs::read_to_string(state_dir().join(STATE_FILE)).ok()?;
        preset(id.trim())
    }

    fn persist(chosen: Option<&Preset>) -> std::io::Result<()> {
        let path = state_dir().join(STATE_FILE);
        match chosen {
            Some(preset) => {
                fs::create_dir_all(state_dir())?;
                fs::write(path, preset.id)
            }
            None => match fs::remove_file(path) {
                Err(error) if error.kind() != ErrorKind::NotFound => Err(error),
                _ => Ok(()),
            },
        }
    }

    struct Icons {
        ico: PathBuf,
        png: PathBuf,
    }

    /// Shortcuts, the toast registration and the uninstall entry all point
    /// at icon *files*, so the active preset's icons live on disk; every
    /// other preset's are removed so nothing else lingers there.
    fn write_icons(chosen: Option<&Preset>) -> std::io::Result<Option<Icons>> {
        let dir = state_dir();
        let wanted = chosen.map(|preset| Icons {
            ico: dir.join(format!("{}.ico", preset.id)),
            png: dir.join(format!("{}.png", preset.id)),
        });
        if let Ok(entries) = fs::read_dir(&dir) {
            for path in entries.filter_map(Result::ok).map(|entry| entry.path()) {
                let keep = wanted
                    .as_ref()
                    .is_some_and(|icons| path == icons.ico || path == icons.png);
                let is_icon = path
                    .extension()
                    .is_some_and(|ext| ext.eq_ignore_ascii_case("ico") || ext.eq_ignore_ascii_case("png"));
                if is_icon && !keep {
                    let _ = fs::remove_file(path);
                }
            }
        }
        let (Some(preset), Some(icons)) = (chosen, wanted) else {
            return Ok(None);
        };
        fs::create_dir_all(&dir)?;
        fs::write(&icons.ico, preset.ico)?;
        fs::write(&icons.png, preset.png)?;
        Ok(Some(icons))
    }

    fn display_name(app: &AppHandle, chosen: Option<&Preset>) -> String {
        chosen.map_or_else(|| app.package_info().name.clone(), |preset| preset.name.to_owned())
    }

    pub(super) fn select(app: &AppHandle, chosen: Option<&'static Preset>) -> Result<(), String> {
        persist(chosen).map_err(|error| error.to_string())?;
        decorate(app, chosen);
        apply_shell(app, chosen)
    }

    pub(super) fn restore(app: &AppHandle) {
        let chosen = active();
        if chosen.is_some() {
            decorate(app, chosen);
        }
        // Nothing to undo when the disguise is off and never renamed anything.
        if chosen.is_none() && CURRENT_USER.open(shortcuts_key(app)).is_err() {
            return;
        }
        let app = app.clone();
        std::thread::spawn(move || {
            if let Err(error) = apply_shell(&app, chosen) {
                eprintln!("[disguise] could not restore {:?}: {error}", chosen.map(|p| p.id));
            }
        });
    }

    /// Title and window icon (titlebar, Alt+Tab, unpinned taskbar button).
    fn decorate(app: &AppHandle, chosen: Option<&Preset>) {
        let Some(window) = app.get_webview_window(crate::MAIN_WINDOW_LABEL) else {
            return;
        };
        let title = app
            .config()
            .app
            .windows
            .first()
            .and_then(|config| (chosen.is_none()).then(|| config.title.clone()))
            .unwrap_or_else(|| display_name(app, chosen));
        if let Err(error) = window.set_title(&title) {
            eprintln!("[disguise] could not set the window title: {error}");
        }
        let icon = match chosen {
            Some(preset) => image::load_from_memory_with_format(preset.png, image::ImageFormat::Png)
                .ok()
                .map(|decoded| {
                    let rgba = decoded.to_rgba8();
                    let (width, height) = rgba.dimensions();
                    tauri::image::Image::new_owned(rgba.into_raw(), width, height)
                }),
            None => app.default_window_icon().map(|icon| icon.clone().to_owned()),
        };
        if let Some(icon) = icon {
            if let Err(error) = window.set_icon(icon) {
                eprintln!("[disguise] could not set the window icon: {error}");
            }
        }
    }

    fn apply_shell(app: &AppHandle, chosen: Option<&'static Preset>) -> Result<(), String> {
        let exe = std::env::current_exe().map_err(|error| error.to_string())?;
        let icons = write_icons(chosen).map_err(|error| error.to_string())?;
        let name = display_name(app, chosen);
        let aumid = app.config().identifier.clone();

        let shortcuts = {
            let (name, aumid, exe) = (name.clone(), aumid.clone(), exe.clone());
            let icon = icons.as_ref().map_or_else(|| exe.clone(), |icons| icons.ico.clone());
            with_com(move || update_shortcuts(&aumid, &exe, &name, &icon))?
        };
        record_shortcuts(app, if chosen.is_some() { &shortcuts } else { &[] });
        register_toast_identity(&aumid, &name, icons.as_ref());

        let display_icon = match &icons {
            Some(icons) => icons.ico.to_string_lossy().into_owned(),
            None => format!("\"{}\"", exe.display()),
        };
        update_uninstall_entry(app, &name, &display_icon);
        Ok(())
    }

    // --- Shortcuts ---------------------------------------------------------

    struct Shortcut {
        path: PathBuf,
        renames: bool,
    }

    fn known_folder(id: &GUID) -> Option<PathBuf> {
        unsafe {
            let path = SHGetKnownFolderPath(id, KF_FLAG_DEFAULT, None).ok()?;
            let folder = path.to_string().ok().map(PathBuf::from);
            CoTaskMemFree(Some(path.0.cast()));
            folder
        }
    }

    fn link_files(dir: &Path, depth: usize) -> Vec<PathBuf> {
        let Ok(entries) = fs::read_dir(dir) else {
            return Vec::new();
        };
        let mut links = Vec::new();
        for path in entries.filter_map(Result::ok).map(|entry| entry.path()) {
            if path.is_dir() && depth > 0 {
                links.extend(link_files(&path, depth - 1));
            } else if path.extension().is_some_and(|ext| ext.eq_ignore_ascii_case("lnk")) {
                links.push(path);
            }
        }
        links
    }

    fn candidates() -> Vec<Shortcut> {
        let renamed = [FOLDERID_Programs, FOLDERID_Desktop]
            .iter()
            .filter_map(known_folder)
            .flat_map(|dir| link_files(&dir, 1))
            .map(|path| Shortcut { path, renames: true });
        let pinned = known_folder(&FOLDERID_UserPinned)
            .map(|dir| link_files(&dir.join("TaskBar"), 0))
            .unwrap_or_default()
            .into_iter()
            .map(|path| Shortcut { path, renames: false });
        renamed.chain(pinned).collect()
    }

    fn open_link(path: &Path) -> windows::core::Result<(IShellLinkW, IPersistFile)> {
        unsafe {
            let link: IShellLinkW = CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER)?;
            let file: IPersistFile = link.cast()?;
            file.Load(&HSTRING::from(path), STGM_READWRITE)?;
            Ok((link, file))
        }
    }

    fn app_user_model_id(link: &IShellLinkW) -> Option<String> {
        unsafe {
            let store: IPropertyStore = link.cast().ok()?;
            let value = store.GetValue(&PKEY_AppUserModel_ID).ok()?;
            let text = PropVariantToStringAlloc(&value).ok()?;
            let id = text.to_string().ok();
            CoTaskMemFree(Some(text.0.cast()));
            id
        }
    }

    fn link_target(link: &IShellLinkW) -> Option<PathBuf> {
        let mut buffer = [0u16; 1024];
        unsafe { link.GetPath(&mut buffer, std::ptr::null_mut(), 0).ok()? };
        let len = buffer.iter().position(|&c| c == 0).unwrap_or(buffer.len());
        (len > 0).then(|| PathBuf::from(String::from_utf16_lossy(&buffer[..len])))
    }

    /// The installer's shortcuts carry our AppUserModelID; also accept any
    /// shortcut that launches a binary from our install folder, which covers
    /// ones the user made by hand.
    fn is_ours(link: &IShellLinkW, aumid: &str, install_dir: Option<&Path>) -> bool {
        if app_user_model_id(link).as_deref() == Some(aumid) {
            return true;
        }
        match (link_target(link), install_dir) {
            (Some(target), Some(dir)) => target
                .parent()
                .is_some_and(|parent| parent.as_os_str().eq_ignore_ascii_case(dir.as_os_str())),
            _ => false,
        }
    }

    fn file_name(name: &str) -> String {
        let cleaned: String = name
            .chars()
            .map(|c| if "<>:\"/\\|?*".contains(c) || c.is_control() { '-' } else { c })
            .collect();
        format!("{}.lnk", cleaned.trim_end_matches(['.', ' ']))
    }

    fn notify(event: SHCNE_ID, from: &Path, to: Option<&Path>) {
        let from = HSTRING::from(from);
        let to = to.map(HSTRING::from);
        unsafe {
            SHChangeNotify(
                event,
                SHCNF_PATHW,
                Some(from.as_ptr().cast()),
                to.as_ref().map(|to| to.as_ptr().cast()),
            );
        }
    }

    fn update_shortcuts(aumid: &str, exe: &Path, name: &str, icon: &Path) -> Result<Vec<PathBuf>, String> {
        let wanted = file_name(name);
        let install_dir = exe.parent();
        let mut renamed = Vec::new();
        for shortcut in candidates() {
            let Ok((link, file)) = open_link(&shortcut.path) else {
                continue;
            };
            if !is_ours(&link, aumid, install_dir) {
                continue;
            }
            unsafe {
                link.SetIconLocation(&HSTRING::from(icon), 0)
                    .and_then(|()| file.Save(PCWSTR::null(), true))
                    .map_err(|error| error.message())?;
            }
            notify(SHCNE_UPDATEITEM, &shortcut.path, None);
            if !shortcut.renames {
                continue;
            }
            let target = shortcut.path.with_file_name(&wanted);
            if target == shortcut.path {
                renamed.push(target);
            } else if !target.exists() {
                fs::rename(&shortcut.path, &target).map_err(|error| error.to_string())?;
                notify(SHCNE_RENAMEITEM, &shortcut.path, Some(&target));
                renamed.push(target);
            } else if open_link(&target).is_ok_and(|(other, _)| is_ours(&other, aumid, install_dir)) {
                // An update re-created "<productName>.lnk" next to the
                // renamed one: drop the duplicate instead of leaving the real
                // name in the Start menu.
                drop(link);
                drop(file);
                let _ = fs::remove_file(&shortcut.path);
                notify(SHCNE_UPDATEITEM, &target, None);
                renamed.push(target);
            } else {
                // Name taken by something else; it still has the decoy icon.
                renamed.push(shortcut.path);
            }
        }
        unsafe { SHChangeNotify(SHCNE_ASSOCCHANGED, SHCNF_IDLIST, None, None) };
        Ok(renamed)
    }

    fn with_com<T: Send + 'static>(
        work: impl FnOnce() -> Result<T, String> + Send + 'static,
    ) -> Result<T, String> {
        std::thread::spawn(move || {
            let initialized = unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED) };
            let result = work();
            if initialized.is_ok() {
                unsafe { CoUninitialize() };
            }
            result
        })
        .join()
        .map_err(|_| "the shortcut update crashed".to_owned())?
    }

    // --- Registry ----------------------------------------------------------

    fn shortcuts_key(app: &AppHandle) -> String {
        format!(r"Software\{}\{SHORTCUTS_KEY}", app.config().identifier)
    }

    fn record_shortcuts(app: &AppHandle, shortcuts: &[PathBuf]) {
        let path = shortcuts_key(app);
        let _ = CURRENT_USER.remove_tree(&path);
        if shortcuts.is_empty() {
            return;
        }
        let Ok(key) = CURRENT_USER.create(&path) else {
            return;
        };
        for (index, shortcut) in shortcuts.iter().enumerate() {
            let _ = key.set_string(format!("Shortcut{index}"), shortcut.to_string_lossy());
        }
    }

    /// Toasts of unpackaged apps take their header name/icon from this key
    /// when present. Removed entirely when the disguise is off — nothing
    /// else registers it, so the header falls back to the Start menu
    /// shortcut as before.
    fn register_toast_identity(aumid: &str, name: &str, icons: Option<&Icons>) {
        let path = format!(r"Software\Classes\AppUserModelId\{aumid}");
        let Some(icons) = icons else {
            let _ = CURRENT_USER.remove_tree(&path);
            return;
        };
        if let Ok(key) = CURRENT_USER.create(&path) {
            let _ = key.set_string("DisplayName", name);
            let _ = key.set_string("IconUri", icons.png.to_string_lossy());
        }
    }

    /// "Installed apps" entry. Only touched if it already exists under
    /// HKCU (per-user install) — a per-machine install's HKLM entry isn't
    /// writable without elevation.
    fn update_uninstall_entry(app: &AppHandle, name: &str, icon: &str) {
        let path = format!(
            r"Software\Microsoft\Windows\CurrentVersion\Uninstall\{}",
            app.package_info().name
        );
        if let Ok(key) = CURRENT_USER.options().read().write().open(&path) {
            let _ = key.set_string("DisplayName", name);
            let _ = key.set_string("DisplayIcon", icon);
        }
    }
}
