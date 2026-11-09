/**
 * Android 13+ per-app language. There the language is picked in the system's
 * "App languages" settings (offered from res/xml/locales_config.xml, see
 * AppLocale.kt) and i18next just follows it: once at boot, and on every
 * `fg:app-locale` event MainActivity sends after a configuration change or
 * on resume. Below Android 13 and off Android the bridge is missing, this is
 * a no-op, and Customizability keeps its own language sheet.
 */
import type { i18n as I18n } from "i18next";
import { I18NEXT_STORAGE_KEY } from "../i18n";
import { resolveSupportedLocale } from "../utils/locales";

type AppLocaleState = { app: string; system: string };

type AppLocaleBridge = {
	getAppLocaleState?: () => string | null;
	setAppLocale?: (languageTags: string) => boolean;
	openAppLocaleSettings?: () => boolean;
};

const APP_LOCALE_EVENT = "fg:app-locale";
const MIGRATED_KEY = "fg-app-locale-migrated";

function getBridge(): AppLocaleBridge | undefined {
	return (window as unknown as { FreeGrindBridge?: AppLocaleBridge }).FreeGrindBridge;
}

function readState(): AppLocaleState | null {
	try {
		const json = getBridge()?.getAppLocaleState?.();
		if (!json) return null;
		const parsed = JSON.parse(json) as Partial<AppLocaleState>;
		return { app: parsed.app ?? "", system: parsed.system ?? "" };
	} catch {
		return null;
	}
}

/** True where the language is chosen in Android's per-app language settings. */
export function hasNativeAppLocale(): boolean {
	return Boolean(getBridge()?.openAppLocaleSettings) && readState() !== null;
}

/** Opens Android's "App languages" page for this app; false if it couldn't. */
export function openNativeAppLocaleSettings(): boolean {
	try {
		return getBridge()?.openAppLocaleSettings?.() ?? false;
	} catch {
		return false;
	}
}

function firstTag(tags: string): string {
	return tags.split(",")[0]?.trim() ?? "";
}

function applyState(i18n: I18n, state: AppLocaleState): void {
	const tag = firstTag(state.app) || firstTag(state.system);
	if (!tag) return;
	const next = resolveSupportedLocale(tag);
	document.documentElement.lang = next;
	if (i18n.language !== next) {
		void i18n.changeLanguage(next);
	}
}

/**
 * One-time carry-over of a language picked in the old in-app sheet: without
 * it, updating to a build with per-app languages would silently switch those
 * users back to the system language. i18next caches detected languages under
 * the same key, so a stored value matching the system language is treated as
 * "follow the system" rather than pinned.
 */
function migrateInAppChoice(
	bridge: AppLocaleBridge,
	state: AppLocaleState,
	firstStart: boolean,
): AppLocaleState {
	try {
		if (window.localStorage.getItem(MIGRATED_KEY)) return state;
		window.localStorage.setItem(MIGRATED_KEY, "1");
		// A fresh install has no earlier choice: it follows the system.
		if (firstStart || state.app) return state;
		const stored = window.localStorage.getItem(I18NEXT_STORAGE_KEY);
		if (!stored) return state;
		const chosen = resolveSupportedLocale(stored);
		const system = resolveSupportedLocale(firstTag(state.system) || "en");
		if (chosen === system) return state;
		return bridge.setAppLocale?.(chosen) ? { ...state, app: chosen } : state;
	} catch {
		return state;
	}
}

/**
 * Returns false where Android's per-app language isn't available, so the
 * caller picks the first-start language itself (see systemLanguage.ts).
 */
export function installAppLocaleSync(i18n: I18n, firstStart: boolean): boolean {
	const bridge = getBridge();
	const initial = readState();
	if (!bridge || !initial) return false;

	applyState(i18n, migrateInAppChoice(bridge, initial, firstStart));

	window.addEventListener(APP_LOCALE_EVENT, (event) => {
		const detail = (event as CustomEvent<Partial<AppLocaleState>>).detail;
		if (!detail) return;
		applyState(i18n, { app: detail.app ?? "", system: detail.system ?? "" });
	});
	return true;
}
