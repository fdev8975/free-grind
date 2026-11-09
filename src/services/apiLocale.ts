/**
 * Keeps the language Grindr's API answers in (L-Locale / Accept-Language,
 * see src-tauri/src/api/locale.rs) on the app language: once at boot and on
 * every language change. Outside Tauri there is no native client to tell.
 */
import type { i18n as I18n } from "i18next";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { appLog } from "../utils/logger";

function sync(locale: string | undefined): void {
	if (!locale || locale === "cimode") return;
	invoke("set_api_locale", { locale }).catch((error: unknown) => {
		appLog.warn("[api-locale] failed to set:", error);
	});
}

export function installApiLocaleSync(i18n: I18n): void {
	if (!isTauri()) return;
	sync(i18n.language);
	i18n.on("languageChanged", sync);
}
