import { LGBTQ_RISK_COUNTRY_POLYGONS } from "./lgbtqRiskCountries.data";
import { createRegionLookup } from "./regionPolygons";

/**
 * Countries where same-sex relations are criminalized, or where police are
 * known to hunt LGBTQ+ people through dating apps (fake profiles, accounts
 * taken over from people already arrested) even without an explicit law —
 * e.g. Egypt, Jordan, Indonesia and Russia (where the "LGBT movement" is
 * banned as extremist). Based on ILGA World's State-Sponsored Homophobia
 * report and Human Rights Watch's reporting on digital targeting.
 *
 * Loaded lazily (the outlines are ~370 KB) — import this module dynamically.
 * To change the list, edit CODES in scripts/gen-lgbtq-risk-countries.mjs and regenerate.
 */
export type LgbtqRiskCountry = keyof typeof LGBTQ_RISK_COUNTRY_POLYGONS;

/**
 * 3 km margin so coastal spots aren't missed by the simplified outlines
 * (Mombasa island, Palm Jumeirah). The cost is a warning for points right
 * at a land border (e.g. Eilat next to Aqaba) — a missed warning is worse.
 */
const lookup = createRegionLookup(LGBTQ_RISK_COUNTRY_POLYGONS, 3);

export function getLgbtqRiskCountryForGeohash(geohash: string | null | undefined): LgbtqRiskCountry | null {
	return lookup.atGeohash(geohash);
}
