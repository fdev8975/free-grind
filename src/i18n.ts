import i18n from "i18next";
import Backend from "i18next-http-backend";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, matchSupportedLocale } from "./utils/locales";

const i18nBackendBaseUrl = (
	import.meta.env.VITE_I18N_BASE_URL ?? import.meta.env.BASE_URL
).replace(/\/+$/, "");

const preloadLanguages = SUPPORTED_LOCALES;

export const I18NEXT_STORAGE_KEY = "i18nextLng";

// Read before init: the detector caches whatever it picks under this key
// right away, so afterwards a first start looks like a stored choice.
function readStoredLanguage(): string | null {
	try {
		return window.localStorage.getItem(I18NEXT_STORAGE_KEY);
	} catch {
		return null;
	}
}

/** No language stored yet: first start (or cleared app data). */
export const isFirstLanguageStart = !readStoredLanguage();

// Stored and browser languages go through matchSupportedLocale, so i18next
// only ever sees tags we ship a file for: a pre-rename "de" in localStorage
// becomes "de-DE", the browser's "pt" becomes "pt-PT".
const languageDetector = new LanguageDetector();
languageDetector.addDetector({
	name: "supportedLocale",
	lookup() {
		const candidates = [readStoredLanguage(), ...(navigator.languages ?? []), navigator.language];
		for (const candidate of candidates) {
			const match = candidate ? matchSupportedLocale(candidate) : null;
			if (match) return match;
		}
		return undefined;
	},
	cacheUserLanguage(lng) {
		try {
			window.localStorage.setItem(I18NEXT_STORAGE_KEY, lng);
		} catch {
			// Private mode etc.: detected again next start.
		}
	},
});

i18n
	.use(Backend)
	.use(languageDetector)
	.use(initReactI18next)
	.init({
		fallbackLng: [DEFAULT_LOCALE],
		supportedLngs: SUPPORTED_LOCALES,
		// Load exactly the resolved locale's file (e.g. "es-419" or "pt-PT"),
		// not a region-stripped variant that doesn't exist as its own file.
		load: "currentOnly",
		defaultNS: "translation",
		ns: ["translation"],
		returnEmptyString: false,
		interpolation: {
			escapeValue: false,
		},
		detection: {
			order: ["supportedLocale"],
			caches: ["supportedLocale"],
		},
		backend: {
			loadPath: `${i18nBackendBaseUrl}/locales/{{lng}}/{{ns}}.json`,
		},
	})
	.then(() => {
		void i18n.loadLanguages(preloadLanguages);
	});

export default i18n;
