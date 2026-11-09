export const SHOW_LGBTQ_RISK_COUNTRY_EVENT = "fg:show-lgbtq-risk-country";

/** Opens the LGBTQ+ risk country warning for Egypt (dev tool); dismissing it isn't remembered. */
export function showLgbtqRiskCountryWarning(): void {
	if (typeof window === "undefined") {
		return;
	}

	window.dispatchEvent(new Event(SHOW_LGBTQ_RISK_COUNTRY_EVENT));
}
