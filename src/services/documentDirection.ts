/**
 * Keeps <html lang> and <html dir> on the app language: right-to-left for
 * Arabic (and any other RTL language i18next knows), left-to-right otherwise.
 * Layout uses logical Tailwind utilities (ms-/pe-/start-/text-start …) and
 * the `rtl:` variant, so flipping `dir` mirrors the UI.
 */
import type { i18n as I18n } from "i18next";

function apply(i18n: I18n, locale: string | undefined): void {
	if (!locale || locale === "cimode") return;
	const root = document.documentElement;
	root.lang = locale;
	root.dir = i18n.dir(locale);
}

export function installDocumentDirectionSync(i18n: I18n): void {
	apply(i18n, i18n.resolvedLanguage ?? i18n.language);
	i18n.on("languageChanged", (locale) => apply(i18n, locale));
}
