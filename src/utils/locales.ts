// Locales are BCP 47 language-region tags (public/locales/<tag>/), the same
// form Android and the other OSes report, e.g. "de-DE", "pt-BR", "es-419".
const localeModules = import.meta.glob("../../public/locales/*/translation.json");

const localeCodeRegex = /\/public\/locales\/([^/]+)\/translation\.json$/;
export const DEFAULT_LOCALE = "en-US";
const DEFAULT_LOCALES = [DEFAULT_LOCALE, "de-DE"];

// Locale codes from before the switch to language-region tags that the
// language-only fallback below wouldn't map (still in users' localStorage).
const LEGACY_LOCALES: Record<string, string> = {
	arz: "ar-EG",
};

// Which variant a bare language (or a region we don't ship) gets.
const PREFERRED_VARIANTS: Record<string, string> = {
	ar: "ar-SA",
	en: "en-US",
	es: "es-ES",
	pt: "pt-PT",
};

function getDisplayName(localeCode: string): string {
	try {
		const displayNames = new Intl.DisplayNames(["en"], { type: "language" });
		// The region is part of the name ("Portuguese (Brazil)"), so the tag
		// itself isn't shown.
		return displayNames.of(localeCode) || localeCode;
	} catch {
		return localeCode;
	}
}

const detectedLocales = Object.keys(localeModules)
	.map((path) => {
		const match = path.match(localeCodeRegex);
		return match?.[1] ?? null;
	})
	.filter((locale): locale is string => Boolean(locale))
	.sort((a, b) => a.localeCompare(b));

export const SUPPORTED_LOCALES =
	detectedLocales.length > 0 ? detectedLocales : DEFAULT_LOCALES;

export const SUPPORTED_LOCALE_OPTIONS = SUPPORTED_LOCALES.map((localeCode) => ({
	value: localeCode,
	label: getDisplayName(localeCode),
}));

function findSupported(tag: string): string | undefined {
	const lower = tag.toLowerCase();
	return SUPPORTED_LOCALES.find((supported) => supported.toLowerCase() === lower);
}

/**
 * The supported locale for an OS/browser/stored tag, or null if we don't ship
 * its language. Exact tags win ("pt-BR", "de-DE-u-mu-celsius" → "de-DE");
 * otherwise the language decides ("de" → "de-DE", Android's "pt-DE" →
 * "pt-PT", "sr" → "sr-Cyrl-RS"), with Latin American Spanish going to es-419.
 */
export function matchSupportedLocale(locale: string): string | null {
	const normalized = locale.trim().replace(/_/g, "-");
	if (!normalized) return null;
	const legacy = LEGACY_LOCALES[normalized.toLowerCase()];
	if (legacy && findSupported(legacy)) return findSupported(legacy) ?? null;

	const subtags = normalized.split("-");
	for (let length = subtags.length; length > 0; length--) {
		const match = findSupported(subtags.slice(0, length).join("-"));
		if (match) return match;
	}

	const language = subtags[0].toLowerCase();
	const sameLanguage = SUPPORTED_LOCALES.filter(
		(supported) => supported.split("-")[0].toLowerCase() === language,
	);
	if (sameLanguage.length === 0) return null;

	const region = subtags.slice(1).find((subtag) => /^([a-z]{2}|\d{3})$/i.test(subtag))?.toUpperCase();
	if (language === "es" && region && region !== "ES" && sameLanguage.includes("es-419")) {
		return "es-419";
	}
	const preferred = PREFERRED_VARIANTS[language];
	return sameLanguage.find((supported) => supported === preferred) ?? sameLanguage[0];
}

export function resolveSupportedLocale(locale: string): string {
	return (
		matchSupportedLocale(locale) ??
		(SUPPORTED_LOCALES.includes(DEFAULT_LOCALE) ? DEFAULT_LOCALE : (SUPPORTED_LOCALES[0] ?? DEFAULT_LOCALE))
	);
}
