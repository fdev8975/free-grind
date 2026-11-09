import { useState } from "react";
import { Ruler } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ClockFilled } from "../../components/icons/FilledIcons";
import { LanguageSelectRow } from "../../components/LanguageSelectRow";
import { PageHeader } from "../../components/PageHeader";
import { SelectRow } from "../../components/ui/select-row";
import { usePreferences } from "../../contexts/PreferencesContext";
import { useSettingsHighlight } from "../../hooks/useSettingsHighlight";
import { getTimeFormat, TIME_FORMAT_KEY, type TimeFormat } from "../../utils/timeFormat";
import { type UnitsPreset } from "../../utils/units";

/** Language, units and time format. */
export function RegionalPage() {
	const { t } = useTranslation();
	const highlightId = useSettingsHighlight();
	const { unitsPreset, setPreferences } = usePreferences();
	const [timeFormat, setTimeFormat] = useState<TimeFormat>(getTimeFormat);

	return (
		<section className="app-screen">
			<PageHeader
				backTo="/settings"
				title={t("customizability.regional")}
				subtitle={t("settings.regional_desc", { defaultValue: "Language, units and time format." })}
			/>

			<div className="grid gap-6">
				<div className="native-group">
					<LanguageSelectRow id="regional-language" highlighted={highlightId === "regional-language"} />
					<SelectRow
						id="cust-units"
						highlighted={highlightId === "cust-units"}
						icon={<Ruler className="h-5 w-5" />}
						iconClass="bg-cyan-500/15 text-cyan-400"
						label={t("customizability.units")}
						value={unitsPreset}
						onChange={(val) => void setPreferences({ unitsPreset: val as UnitsPreset })}
						options={[
							{ value: "world", label: t("customizability.units_world") },
							{ value: "uk", label: t("customizability.units_uk") },
							{ value: "american", label: t("customizability.units_american") },
						]}
					/>
					<SelectRow
						id="cust-time-format"
						highlighted={highlightId === "cust-time-format"}
						icon={<ClockFilled className="h-5 w-5" />}
						iconClass="bg-indigo-500/15 text-indigo-400"
						label={t("customizability.time_format")}
						value={timeFormat}
						onChange={(val) => {
							setTimeFormat(val as TimeFormat);
							window.localStorage.setItem(TIME_FORMAT_KEY, val);
						}}
						options={[
							{ value: "system", label: t("customizability.time_format_system") },
							{ value: "12h", label: t("customizability.time_format_12h") },
							{ value: "24h", label: t("customizability.time_format_24h") },
						]}
					/>
				</div>
			</div>
		</section>
	);
}
