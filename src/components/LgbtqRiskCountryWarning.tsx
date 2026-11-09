import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ShieldAlert, TriangleAlert } from "lucide-react";

import { usePreferences } from "../contexts/PreferencesContext";
import { useDesktopBreakpoint } from "../hooks/useDesktopBreakpoint";
import { SHOW_LGBTQ_RISK_COUNTRY_EVENT } from "../utils/lgbtqRiskCountryDebug";
import { appLog } from "../utils/logger";
import { NATIVE_SHEET_BG } from "./ui/action-sheet";
import { SHEET_FOOTER_CLASS, sheetButtonClass } from "./ui/bottom-sheet";
import { ControlledBottomSheet } from "./ui/controlled-sheet";

/**
 * Safety warning when the location is set in a country where LGBTQ+ people
 * are criminalized or hunted through dating apps (see
 * utils/lgbtqRiskCountries.ts). Shown when the location lands in such a
 * country, and again every REMIND_AFTER_MS while it stays there — a one-time
 * notice is easy to forget, a daily one would be ignored.
 */

const STORAGE_KEY = "free-grind:lgbtq-risk-country-acknowledged";
const REMIND_AFTER_MS = 30 * 24 * 60 * 60 * 1000;

function loadAcknowledged(): Record<string, number> {
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY);
		const parsed: unknown = raw ? JSON.parse(raw) : {};
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
		return Object.fromEntries(
			Object.entries(parsed).filter((entry): entry is [string, number] => typeof entry[1] === "number"),
		);
	} catch {
		return {};
	}
}

function isRecentlyAcknowledged(country: string): boolean {
	const at = loadAcknowledged()[country];
	return at !== undefined && Date.now() - at < REMIND_AFTER_MS;
}

function acknowledge(country: string) {
	try {
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...loadAcknowledged(), [country]: Date.now() }));
	} catch (error) {
		appLog.warn("[lgbtqRiskCountryWarning] failed to persist acknowledgement", error);
	}
}

function countryDisplayName(code: string, language: string): string {
	try {
		return new Intl.DisplayNames([language, "en"], { type: "region" }).of(code) ?? code;
	} catch {
		return code;
	}
}

export function LgbtqRiskCountryWarning() {
	const { t, i18n } = useTranslation();
	const { geohash } = usePreferences();
	const isDesktop = useDesktopBreakpoint();
	const [country, setCountry] = useState<string | null>(null);
	// Opened from the UI debug options: not remembered as acknowledged.
	const [isPreview, setIsPreview] = useState(false);

	useEffect(() => {
		const handleShow = () => {
			setIsPreview(true);
			setCountry("EG");
		};
		window.addEventListener(SHOW_LGBTQ_RISK_COUNTRY_EVENT, handleShow);
		return () => window.removeEventListener(SHOW_LGBTQ_RISK_COUNTRY_EVENT, handleShow);
	}, []);

	useEffect(() => {
		if (!geohash) return;
		let cancelled = false;
		void import("../utils/lgbtqRiskCountries")
			.then(({ getLgbtqRiskCountryForGeohash }) => {
				if (cancelled) return;
				const match = getLgbtqRiskCountryForGeohash(geohash);
				if (match && !isRecentlyAcknowledged(match)) setCountry(match);
			})
			.catch((error) => appLog.warn("[lgbtqRiskCountryWarning] failed to load country outlines", error));
		return () => {
			cancelled = true;
		};
	}, [geohash]);

	const dismiss = () => {
		if (country && !isPreview) acknowledge(country);
		setIsPreview(false);
		setCountry(null);
	};

	return (
		<ControlledBottomSheet
			isOpen={country !== null}
			onDismiss={dismiss}
			isDesktop={isDesktop}
			bg={NATIVE_SHEET_BG}
			panelClassName="max-h-[92dvh] px-4"
		>
			<div className="-mx-4 min-h-0 flex-1 overflow-y-auto px-4 pb-2" data-lenis-prevent>
				<div className="flex flex-col items-center px-2 pt-2 text-center">
					<span className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500/15 text-red-500">
						<ShieldAlert className="h-7 w-7" />
					</span>
					<h3 className="mt-4 text-base font-semibold text-[var(--text)]">
						{t("lgbtq_risk_country.title", { defaultValue: "Stay safe" })}
					</h3>
					<p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
						{t("lgbtq_risk_country.message", {
							country: country ? countryDisplayName(country, i18n.language) : "",
							defaultValue:
								"Your location is in {{country}}. Same-sex relationships are criminalized there, or LGBTQ+ people are actively persecuted.",
						})}
					</p>
				</div>
				<div role="alert" className="mt-5 flex items-start gap-3 rounded-2xl bg-red-500/10 px-4 py-3">
					<TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
					<p className="text-sm font-medium leading-relaxed text-red-500">
						{t("lgbtq_risk_country.warning", {
							defaultValue:
								"Police are known to use fake profiles, and accounts taken over from people who were already arrested, to set up meetings and make arrests. Be careful before meeting anyone, even profiles that seemed legitimate in the past, and don't send anything that could reveal your identity.",
						})}
					</p>
				</div>
			</div>
			<div className={SHEET_FOOTER_CLASS}>
				<button type="button" onClick={dismiss} className={sheetButtonClass("primary")}>
					<span className="truncate">{t("lgbtq_risk_country.confirm", { defaultValue: "I understand" })}</span>
				</button>
			</div>
		</ControlledBottomSheet>
	);
}
