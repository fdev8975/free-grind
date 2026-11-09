import { Languages } from "lucide-react";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { SelectRow } from "./ui/select-row";
import { SUPPORTED_LOCALE_OPTIONS, resolveSupportedLocale } from "../utils/locales";
import { setNativeAppLocale } from "../services/appLocaleBridge";

/** Settings row for the app language. On Android 13+ the choice is also
 * written to the system's per-app language (see appLocaleBridge.ts). */
export function LanguageSelectRow({ id, highlighted }: { id?: string; highlighted?: boolean }) {
	const { t, i18n } = useTranslation();
	const selectedLocale = resolveSupportedLocale(i18n.language);

	const handleLocaleChange = async (locale: string) => {
		try {
			const nextLocale = resolveSupportedLocale(locale);
			await i18n.changeLanguage(nextLocale);
			document.documentElement.lang = nextLocale;
			setNativeAppLocale(nextLocale);
		} catch (error) {
			const message =
				error instanceof Error && error.message
					? error.message
					: "Failed to change language.";
			toast.error(message);
		}
	};

	return (
		<SelectRow
			id={id}
			highlighted={highlighted}
			icon={<Languages className="h-5 w-5" />}
			iconClass="bg-teal-500/15 text-teal-400"
			label={t("settings.language")}
			value={selectedLocale}
			onChange={(val) => void handleLocaleChange(val)}
			options={SUPPORTED_LOCALE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
			expandable
		/>
	);
}
