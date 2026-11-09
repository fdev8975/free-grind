import { decodeGeohash } from "./geohash";

/**
 * Point-in-region lookup over simplified country outlines stored as flat
 * [lon, lat, lon, lat, ...] outer rings (see the *.data.ts files next to
 * the callers). Shared by the age-verification and LGBTQ+ risk country checks.
 */

type Polygon = { ring: number[]; minLon: number; maxLon: number; minLat: number; maxLat: number };

/** Even-odd ray casting over a flat [lon, lat, ...] ring. */
function ringContains(ring: number[], lon: number, lat: number): boolean {
	let inside = false;
	for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
		const xi = ring[i], yi = ring[i + 1];
		const xj = ring[j], yj = ring[j + 1];
		if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
			inside = !inside;
		}
	}
	return inside;
}

/** Rough distance in km from the point to the nearest edge of the ring. */
function ringDistanceKm(ring: number[], lon: number, lat: number): number {
	const kx = 111.32 * Math.cos((lat * Math.PI) / 180);
	const ky = 110.57;
	let best = Infinity;
	for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
		const ax = (ring[j] - lon) * kx, ay = (ring[j + 1] - lat) * ky;
		const bx = (ring[i] - lon) * kx, by = (ring[i + 1] - lat) * ky;
		const dx = bx - ax, dy = by - ay;
		const lenSq = dx * dx + dy * dy;
		const t = lenSq > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lenSq)) : 0;
		best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
	}
	return best;
}

export type RegionLookup<K extends string> = {
	/** The region containing (or within `marginKm` of) this point, or null. A containing region wins over a nearby one. */
	at(lat: number, lon: number): K | null;
	/** Same as `at`, for the center of a geohash cell. */
	atGeohash(geohash: string | null | undefined): K | null;
};

/**
 * `marginKm` widens every outline: they're simplified to ~2 km, so without
 * it coastal towns could fall just outside.
 */
export function createRegionLookup<K extends string>(regions: Record<K, number[][]>, marginKm: number): RegionLookup<K> {
	const marginDeg = marginKm / 50; // generous: bbox prefilter only
	let indexed: { region: K; polygons: Polygon[] }[] | null = null;

	function getIndex() {
		if (indexed) return indexed;
		indexed = (Object.keys(regions) as K[]).map((region) => ({
			region,
			polygons: regions[region].map((ring) => {
				let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
				for (let i = 0; i < ring.length; i += 2) {
					minLon = Math.min(minLon, ring[i]);
					maxLon = Math.max(maxLon, ring[i]);
					minLat = Math.min(minLat, ring[i + 1]);
					maxLat = Math.max(maxLat, ring[i + 1]);
				}
				return { ring, minLon, maxLon, minLat, maxLat };
			}),
		}));
		return indexed;
	}

	function at(lat: number, lon: number): K | null {
		if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
		let nearby: K | null = null;
		for (const { region, polygons } of getIndex()) {
			for (const p of polygons) {
				if (
					lon < p.minLon - marginDeg || lon > p.maxLon + marginDeg ||
					lat < p.minLat - marginDeg || lat > p.maxLat + marginDeg
				) continue;
				if (ringContains(p.ring, lon, lat)) return region;
				if (nearby === null && marginKm > 0 && ringDistanceKm(p.ring, lon, lat) <= marginKm) nearby = region;
			}
		}
		return nearby;
	}

	function atGeohash(geohash: string | null | undefined): K | null {
		if (!geohash) return null;
		try {
			const decoded = decodeGeohash(geohash);
			return at((decoded.lat[0] + decoded.lat[1]) / 2, (decoded.lon[0] + decoded.lon[1]) / 2);
		} catch {
			return null;
		}
	}

	return { at, atGeohash };
}
