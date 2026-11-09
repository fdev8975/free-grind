import { AGE_VERIFICATION_REGION_POLYGONS } from "./ageVerificationRegions.data";
import { createRegionLookup } from "./regionPolygons";

/**
 * Regions where Grindr locks the account behind a legal age verification
 * (session JWT `restriction` = `AGE_RESTRICTED`, `restrictionReason` =
 * `UK_/BR_/AU_VERIFICATION_REQUIRED`) as soon as its location lands there.
 * Free Grind can't complete that verification, and the location can't be
 * moved back out until it's done in the official app.
 *
 * Grindr exposes no list of these regions, so they're hardcoded here — keep
 * in sync with `VerificationRegion` in grindr-patched/src/auth.rs. The US
 * (`US_VERIFICATION_REQUIRED`) is left out on purpose: it only asks for an
 * app store age signal and doesn't block the account.
 */
export type AgeVerificationRegion = keyof typeof AGE_VERIFICATION_REGION_POLYGONS;

/**
 * 4 km margin around the outlines; the cost is a warning for points a few km
 * across a land border (e.g. on the Irish side of Northern Ireland).
 */
const lookup = createRegionLookup(AGE_VERIFICATION_REGION_POLYGONS, 4);

/** The age-verification region containing (or within a few km of) this point, or null. */
export function getAgeVerificationRegion(lat: number, lon: number): AgeVerificationRegion | null {
	return lookup.at(lat, lon);
}

export function getAgeVerificationRegionForGeohash(geohash: string | null | undefined): AgeVerificationRegion | null {
	return lookup.atGeohash(geohash);
}
