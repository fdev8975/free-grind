const localeModules = import.meta.glob("../../public/locales/*/translation.json");

const localeCodeRegex = /\/public\/locales\/([^/]+)\/translation\.json$/;
const DEFAULT_LOCALES = ["en", "de"];

function getDisplayName(localeCode: string): string {
	try {
		const displayNames = new Intl.DisplayNames(["en"], { type: "language" });
		const name = displayNames.of(localeCode);
		if (!name) {
			return localeCode;
		}
		return `${name} (${localeCode})`;
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

/** The supported locale for an OS/browser tag, or null if none fits. */
export function matchSupportedLocale(locale: string): string | null {
	// Drop subtags from the end until one matches, so e.g. Android's
	// "sr-Cyrl-RS" or "de-DE-u-mu-celsius" still find "sr-Cyrl" / "de".
	const subtags = locale.trim().replace(/_/g, "-").split("-");
	for (let length = subtags.length; length > 0; length--) {
		const candidate = subtags.slice(0, length).join("-").toLowerCase();
		const match = SUPPORTED_LOCALES.find((supported) => supported.toLowerCase() === candidate);
		if (match) {
			return match;
		}
	}
	return null;
}

export function resolveSupportedLocale(locale: string): string {
	const match = matchSupportedLocale(locale);
	if (match) {
		return match;
	}

	if (SUPPORTED_LOCALES.includes("en")) {
		return "en";
	}

	return SUPPORTED_LOCALES[0] ?? "en";
}
