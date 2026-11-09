/**
 * First start: use the operating system's language. i18next's own navigator
 * detection isn't reliable for that: iOS's WKWebView reports the app bundle's
 * localizations rather than the device language, and its plain
 * language/region fallback misses tags like "sr-Cyrl-RS". In Tauri the OS
 * locale comes from plugin-os (Windows: display language, Apple: preferred
 * languages); in a plain browser from navigator.languages.
 *
 * Android 13+ is handled by appLocaleBridge.ts instead, and later starts keep
 * whatever is stored (the user's choice from the language sheet).
 */
import type { i18n as I18n } from "i18next";
import { isTauri } from "@tauri-apps/api/core";
import { locale as osLocale } from "@tauri-apps/plugin-os";
import { DEFAULT_LOCALE, matchSupportedLocale, resolveSupportedLocale } from "../utils/locales";

async function systemLocaleCandidates(): Promise<string[]> {
	const candidates: string[] = [];
	if (isTauri()) {
		try {
			const tag = await osLocale();
			if (tag) candidates.push(tag);
		} catch {
			// Fall through to the WebView's view of it.
		}
	}
	candidates.push(...(navigator.languages ?? []), navigator.language);
	return candidates.filter(Boolean);
}

export async function applySystemLanguage(i18n: I18n): Promise<void> {
	const candidates = await systemLocaleCandidates();
	const next =
		candidates.map(matchSupportedLocale).find((match): match is string => Boolean(match)) ??
		resolveSupportedLocale(DEFAULT_LOCALE);
	document.documentElement.lang = next;
	if (i18n.language !== next) {
		await i18n.changeLanguage(next);
	}
}
