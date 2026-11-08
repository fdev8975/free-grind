import { useEffect, useRef } from "react";
import { useEffectiveColorScheme } from "../../../../hooks/useEffectiveColorScheme";
import { applyDarkMapTheme, createPinMarkerElement, getMapStyleUrl, relaxRoadZoomThresholds } from "./mapStyles";

type Props = {
	lat: number;
	lon: number;
	className?: string;
	interactive?: boolean;
	zoom?: number;
	/** Draws a translucent accuracy circle of this radius (meters) around the pin. */
	radiusMeters?: number;
	/** false leaves out the pin marker, e.g. for a thumbnail too small for it (the caller draws its own). */
	marker?: boolean;
};

const ACCURACY_SOURCE_ID = "accuracy-circle";

const EARTH_RADIUS_METERS = 6371008.8;
// Web Mercator can't show the poles; keeps fitBounds inside the valid range.
const MAX_MERCATOR_LAT = 85;

// Geodesic circle (destination-point formula), so even radii of thousands of
// kilometres yield valid coordinates instead of latitudes beyond ±90.
function buildCirclePolygon(lat: number, lon: number, radiusMeters: number, steps = 64) {
	const toRad = Math.PI / 180;
	const lat1 = lat * toRad;
	const lon1 = lon * toRad;
	const angular = Math.min(radiusMeters / EARTH_RADIUS_METERS, Math.PI);
	const ring: [number, number][] = [];
	let prevLon: number | null = null;
	for (let i = 0; i <= steps; i++) {
		const bearing = (i / steps) * 2 * Math.PI;
		const lat2 = Math.asin(
			Math.sin(lat1) * Math.cos(angular) + Math.cos(lat1) * Math.sin(angular) * Math.cos(bearing),
		);
		const lon2 =
			lon1 +
			Math.atan2(
				Math.sin(bearing) * Math.sin(angular) * Math.cos(lat1),
				Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2),
			);
		let lonDeg = lon2 / toRad;
		// Keep the ring continuous across the antimeridian.
		if (prevLon !== null) {
			while (lonDeg - prevLon > 180) lonDeg -= 360;
			while (lonDeg - prevLon < -180) lonDeg += 360;
		}
		prevLon = lonDeg;
		ring.push([lonDeg, lat2 / toRad]);
	}
	return {
		type: "Feature" as const,
		properties: {},
		geometry: { type: "Polygon" as const, coordinates: [ring] },
	};
}

// Adds (or updates) the accuracy circle. Safe to call before the style has
// loaded — it bails out and the style.load handler calls it again.
function syncAccuracyCircle(map: any, lat: number, lon: number, radiusMeters?: number) {
	if (!map.isStyleLoaded()) return;
	const hasRadius = Boolean(radiusMeters && radiusMeters > 0);
	const source = map.getSource(ACCURACY_SOURCE_ID);
	if (!hasRadius) {
		if (source) {
			map.removeLayer(`${ACCURACY_SOURCE_ID}-line`);
			map.removeLayer(`${ACCURACY_SOURCE_ID}-fill`);
			map.removeSource(ACCURACY_SOURCE_ID);
		}
		return;
	}
	const data = buildCirclePolygon(lat, lon, radiusMeters!);
	if (source) {
		source.setData(data);
		return;
	}
	const color =
		getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#7c3aed";
	map.addSource(ACCURACY_SOURCE_ID, { type: "geojson", data });
	map.addLayer({
		id: `${ACCURACY_SOURCE_ID}-fill`,
		type: "fill",
		source: ACCURACY_SOURCE_ID,
		paint: { "fill-color": color, "fill-opacity": 0.15 },
	});
	map.addLayer({
		id: `${ACCURACY_SOURCE_ID}-line`,
		type: "line",
		source: ACCURACY_SOURCE_ID,
		paint: { "line-color": color, "line-width": 1.5, "line-opacity": 0.6 },
	});
}

// Frames the accuracy circle when there is one, otherwise just recenters.
function focusPosition(map: any, lat: number, lon: number, radiusMeters: number | undefined, duration: number) {
	if (radiusMeters && radiusMeters > 0) {
		const dLat = radiusMeters / 111320;
		const cosLat = Math.cos((lat * Math.PI) / 180);
		const dLon = Math.min(180, cosLat > 1e-6 ? radiusMeters / (111320 * cosLat) : 180);
		const south = Math.max(-MAX_MERCATOR_LAT, lat - dLat);
		const north = Math.min(MAX_MERCATOR_LAT, lat + dLat);
		if (!Number.isFinite(dLat) || south >= north) {
			map.easeTo({ center: [lon, lat], zoom: 0, duration });
			return;
		}
		map.fitBounds(
			[[lon - dLon, south], [lon + dLon, north]],
			{ padding: 40, maxZoom: 17, duration },
		);
		return;
	}
	map.easeTo({ center: [lon, lat], duration });
}

export function MapLocationPreview({
	lat: rawLat,
	lon: rawLon,
	className = "h-32 w-full",
	interactive = false,
	zoom = 15,
	radiusMeters,
	marker = true,
}: Props) {
	// MapLibre throws on out-of-range coordinates, which would take down the
	// whole React tree — clamp/wrap anything a caller gets wrong.
	const lat = Number.isFinite(rawLat) ? Math.max(-90, Math.min(90, rawLat)) : 0;
	const lon = Number.isFinite(rawLon) ? ((((rawLon + 180) % 360) + 360) % 360) - 180 : 0;
	const containerRef = useRef<HTMLDivElement | null>(null);
	const mapRef = useRef<any>(null);
	const markerRef = useRef<any>(null);
	const scheme = useEffectiveColorScheme();
	// Latest position, read by the (re)initialising effect so a position
	// change doesn't tear down and rebuild the whole map.
	const positionRef = useRef({ lat, lon, radiusMeters });
	positionRef.current = { lat, lon, radiusMeters };

	useEffect(() => {
		let mounted = true;

		const init = async () => {
			try {
				const maplibregl = (await import("maplibre-gl")).default;
				await import("maplibre-gl/dist/maplibre-gl.css");
				if (!mounted || !containerRef.current || mapRef.current) return;

				const start = positionRef.current;
				const map = new maplibregl.Map({
					container: containerRef.current,
					style: getMapStyleUrl(scheme),
					center: [start.lon, start.lat],
					zoom,
					interactive,
					attributionControl: false,
				});

				map.on("style.load", () => {
					relaxRoadZoomThresholds(map);
					if (scheme === "dark") applyDarkMapTheme(map);
					const current = positionRef.current;
					syncAccuracyCircle(map, current.lat, current.lon, current.radiusMeters);
				});

				if (marker) markerRef.current = new maplibregl.Marker({ element: createPinMarkerElement(), anchor: "bottom" })
					.setLngLat([start.lon, start.lat])
					.addTo(map);

				if (start.radiusMeters && start.radiusMeters > 0) {
					focusPosition(map, start.lat, start.lon, start.radiusMeters, 0);
				}
				mapRef.current = map;
			} catch {
				// silently fail
			}
		};

		void init();

		return () => {
			mounted = false;
			markerRef.current = null;
			if (mapRef.current) {
				mapRef.current.remove();
				mapRef.current = null;
			}
		};
	}, [scheme, interactive, zoom, marker]);

	useEffect(() => {
		const map = mapRef.current;
		if (!map) return;
		markerRef.current?.setLngLat([lon, lat]);
		syncAccuracyCircle(map, lat, lon, radiusMeters);
		focusPosition(map, lat, lon, radiusMeters, 600);
	}, [lat, lon, radiusMeters]);

	return <div ref={containerRef} className={className} style={{ isolation: "isolate" }} />;
}
