//! Backend selection (official Grindr servers or a self-hosted, API-compatible
//! free-grind-server). The choice is made on the sign-in screen, persisted,
//! remembered per saved account, and applied to the `grindr` crate's
//! process-wide [`grindr::set_server_config`].

use std::time::Duration;

use serde::{Deserialize, Serialize};

use super::auth::{adopt_client, clear_slot, get_slot_bytes, set_slot_bytes, AuthStorage, DeviceStorage};
use crate::error::AppError;

const ACTIVE_SERVER_SLOT: &str = "server-config";

fn account_server_slot(profile_id: &str) -> String {
    format!("server-{profile_id}")
}

pub struct ServerStorage;

impl ServerStorage {
    fn decode(bytes: &[u8]) -> Option<grindr::ServerConfig> {
        serde_json::from_slice(bytes).ok()
    }

    /// The persisted active backend; official when nothing (or garbage) is stored.
    pub fn load_active() -> grindr::ServerConfig {
        get_slot_bytes(ACTIVE_SERVER_SLOT)
            .ok()
            .flatten()
            .and_then(|b| Self::decode(&b))
            .unwrap_or_default()
    }

    pub fn save_active(config: &grindr::ServerConfig) -> Result<(), AppError> {
        let bytes = serde_json::to_vec(config).map_err(|e| AppError::Auth(e.to_string()))?;
        set_slot_bytes(ACTIVE_SERVER_SLOT, &bytes)
    }

    /// The backend a saved account belongs to. Accounts saved before server
    /// selection existed are official ones.
    pub fn load_for_account(profile_id: &str) -> grindr::ServerConfig {
        get_slot_bytes(&account_server_slot(profile_id))
            .ok()
            .flatten()
            .and_then(|b| Self::decode(&b))
            .unwrap_or_default()
    }

    pub fn save_for_account(profile_id: &str, config: &grindr::ServerConfig) -> Result<(), AppError> {
        let bytes = serde_json::to_vec(config).map_err(|e| AppError::Auth(e.to_string()))?;
        set_slot_bytes(&account_server_slot(profile_id), &bytes)
    }

    pub fn forget_account(profile_id: &str) {
        let _ = clear_slot(&account_server_slot(profile_id));
    }
}

/// Applies the persisted backend before the first client is built (startup).
pub fn apply_persisted_server() {
    grindr::set_server_config(ServerStorage::load_active());
}

/// Makes `config` active and persists it as the current choice.
pub fn activate(config: grindr::ServerConfig) -> Result<(), AppError> {
    ServerStorage::save_active(&config)?;
    grindr::set_server_config(config);
    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerInfo {
    pub kind: &'static str,
    pub api_base: String,
    pub media_base: Option<String>,
}

fn info(config: &grindr::ServerConfig) -> ServerInfo {
    ServerInfo {
        kind: if config.is_official() { "official" } else { "custom" },
        api_base: config.api_base().to_owned(),
        media_base: config.media_base().map(str::to_owned),
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerSelection {
    /// `None` = official servers.
    pub api_base: Option<String>,
    pub media_base: Option<String>,
}

fn parse_selection(selection: &ServerSelection) -> Result<grindr::ServerConfig, AppError> {
    match selection.api_base.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        None => Ok(grindr::ServerConfig::Official),
        Some(api_base) => grindr::ServerConfig::custom(api_base, selection.media_base.as_deref())
            .map_err(|e| AppError::Http(e.to_string())),
    }
}

#[tauri::command]
pub async fn get_server_config() -> Result<ServerInfo, AppError> {
    Ok(info(&grindr::server_config()))
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerProbe {
    pub ok: bool,
    pub latency_ms: u64,
    pub error: Option<String>,
}

/// Checks that `selection` points at a reachable free-grind-server
/// (`GET /healthz` → `{"ok":true}`). Nothing is changed.
#[tauri::command]
pub async fn test_server(selection: ServerSelection) -> Result<ServerProbe, AppError> {
    let config = parse_selection(&selection)?;
    if config.is_official() {
        return Ok(ServerProbe { ok: true, latency_ms: 0, error: None });
    }
    let client = wreq::Client::builder()
        .timeout(Duration::from_secs(8))
        .build()
        .map_err(|e| AppError::Http(e.to_string()))?;
    let started = std::time::Instant::now();
    let result = client.get(format!("{}/healthz", config.api_base())).send().await;
    let latency_ms = started.elapsed().as_millis() as u64;
    let probe = match result {
        Err(e) => ServerProbe { ok: false, latency_ms, error: Some(e.to_string()) },
        Ok(resp) if !resp.status().is_success() => ServerProbe {
            ok: false,
            latency_ms,
            error: Some(format!("HTTP {}", resp.status().as_u16())),
        },
        Ok(resp) => match resp.json::<serde_json::Value>().await {
            Ok(body) if body.get("ok").and_then(|v| v.as_bool()) == Some(true) => {
                ServerProbe { ok: true, latency_ms, error: None }
            }
            _ => ServerProbe {
                ok: false,
                latency_ms,
                error: Some("not a free-grind-server (unexpected /healthz response)".to_owned()),
            },
        },
    };
    Ok(probe)
}

/// Switches the backend. Only while signed out, so a session of one server is
/// never sent to another; the device identity is rotated as well, so the two
/// servers can't correlate this device.
#[tauri::command]
pub async fn set_server_config(app: tauri::AppHandle, selection: ServerSelection) -> Result<ServerInfo, AppError> {
    let config = parse_selection(&selection)?;
    if AuthStorage::get_session().ok().flatten().is_some() {
        return Err(AppError::Auth("sign out before changing the server".to_owned()));
    }
    if *grindr::server_config() == config {
        return Ok(info(&config));
    }
    activate(config.clone())?;
    let device = grindr::DeviceInfo::generate();
    let _ = DeviceStorage::save(&device);
    adopt_client(&app, Some(device), None)?;
    Ok(info(&config))
}
