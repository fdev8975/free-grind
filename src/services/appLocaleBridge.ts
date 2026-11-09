/**
 * Android 13+ per-app language, kept in sync both ways with the in-app
 * language sheet:
 * - picking a language in the sheet writes it to Android
 *   (setNativeAppLocale), so the system's "App languages" page shows it;
 * - a language picked on that page (offered from res/xml/locales_config.xml,
 *   see AppLocale.kt) reaches i18next at boot and through the `fg:app-locale`
 *   event MainActivity sends after a configuration change or on resume.
 * The sheet stays the main picker because that page only offers languages,
 * never regions (it sets e.g. "pt-DE" from the system region), and leaves out
 * languages the ROM itself lacks (Bosnian, Serbian on some devices).
 * Below Android 13 and off Android the bridge is missing and this is a no-op.
 */
import type { i18n as I18n } from "i18next";
import { I18NEXT_STORAGE_KEY } from "../i18n";
import { DEFAULT_LOCALE, resolveSupportedLocale } from "../utils/locales";

type AppLocaleState = { app: string; system: string };

type AppLocaleBridge = {
	getAppLocaleState?: () => string | null;
	setAppLocale?: (languageTags: string) => boolean;
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

/** Mirrors a language picked in the app into Android's per-app language (13+). */
export function setNativeAppLocale(locale: string): void {
	try {
		getBridge()?.setAppLocale?.(locale);
	} catch {
		// Below Android 13 / off Android: nothing to sync.
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
 * One-time carry-over of a language picked in the in-app sheet before it was
 * synced to Android: without it, the first start of this build would switch
 * those users to the system language. i18next caches detected languages under
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
		const system = resolveSupportedLocale(firstTag(state.system) || DEFAULT_LOCALE);
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
