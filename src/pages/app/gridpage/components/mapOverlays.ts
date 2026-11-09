/**
 * Extra layers on top of the location picker's basemap: a heatmap of where
 * people are, and tappable markers for curated places (explore cities and
 * neighbourhoods).
 */

export type MapHeatmapPoint = { lat: number; lon: number; intensity: number };

export type MapPlace = {
	id: string | number;
	lat: number;
	lon: number;
	label: string;
	/** Emoji shown in the marker's bubble. */
	icon: string;
	/** Rainbow ring (neighbourhoods) instead of the plain white ring. */
	highlight?: boolean;
	/** Marker is only shown while minZoom <= zoom < maxZoom. */
	minZoom?: number;
	maxZoom?: number;
};

const HEATMAP_SOURCE_ID = "fg-heatmap";
const HEATMAP_LAYER_ID = "fg-heatmap-layer";
/** Server intensities run 1..5. */
const MAX_INTENSITY = 5;

const HEATMAP_PAINT = {
	"heatmap-weight": ["interpolate", ["linear"], ["get", "intensity"], 0, 0, MAX_INTENSITY, 1],
	"heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 9, 0.6, 15, 1.4],
	// The points sit a few hundred meters apart, so the radius doubles with
	// every zoom level (like the ground distance per pixel halves) to keep
	// neighbouring points merging into one soft area instead of separating
	// into dots.
	"heatmap-radius": ["interpolate", ["exponential", 2], ["zoom"], 9, 4, 13, 60, 17, 960],
	"heatmap-opacity": ["interpolate", ["linear"], ["zoom"], 8, 0, 9.5, 0.75],
};

/** The accent as [r, g, b]: the given #rrggbb, else the app's --accent. */
function resolveAccentRgb(accent?: string): [number, number, number] {
	const raw = accent && /^#[0-9a-f]{6}$/i.test(accent)
		? accent
		: getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();
	const hex = /^#([0-9a-f]{6})$/i.exec(raw)?.[1] ?? "7c3aed";
	return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
}

/**
 * Heat colors in the accent: transparent at the edges, the accent itself
 * through the body, lightening toward white only at the busiest spots.
 * maplibre paint needs real color values, hence no CSS variables.
 */
function heatmapColor(accent?: string) {
	const [r, g, b] = resolveAccentRgb(accent);
	const tint = (towardWhite: number, alpha: number) => {
		const mix = (c: number) => Math.round(c + (255 - c) * towardWhite);
		return `rgba(${mix(r)}, ${mix(g)}, ${mix(b)}, ${alpha})`;
	};
	return [
		"interpolate",
		["linear"],
		["heatmap-density"],
		0, tint(0, 0),
		0.15, tint(0, 0.3),
		0.4, tint(0, 0.55),
		0.7, tint(0.25, 0.7),
		1, tint(0.6, 0.85),
	];
}

/** Re-tints a live heatmap, e.g. when switching between the set/explore tabs. */
export function setHeatmapAccent(map: any, accent?: string): void {
	try {
		if (map.getLayer(HEATMAP_LAYER_ID)) map.setPaintProperty(HEATMAP_LAYER_ID, "heatmap-color", heatmapColor(accent));
	} catch {
		// best-effort
	}
}

function toFeatureCollection(points: MapHeatmapPoint[]) {
	return {
		type: "FeatureCollection" as const,
		features: points.map((point) => ({
			type: "Feature" as const,
			properties: { intensity: point.intensity },
			geometry: { type: "Point" as const, coordinates: [point.lon, point.lat] },
		})),
	};
}

/**
 * Adds (or updates) the heatmap layer. Safe to call repeatedly and again after
 * every style (re)load — setStyle drops custom sources and layers. Inserted
 * below the first label layer so street/place names stay readable on top.
 */
export function syncHeatmapLayer(map: any, points: MapHeatmapPoint[], accent?: string): void {
	// No isStyleLoaded() guard: that's also false while tiles are still
	// loading, which would drop updates. addSource only throws while the style
	// itself isn't parsed yet — caught below; the caller's style.load handler
	// adds the layer once it is.
	try {
		const data = toFeatureCollection(points);
		const source = map.getSource(HEATMAP_SOURCE_ID);
		if (source) {
			source.setData(data);
			return;
		}
		if (points.length === 0) return;

		map.addSource(HEATMAP_SOURCE_ID, { type: "geojson", data });
		const firstLabelLayer = (map.getStyle()?.layers ?? []).find(
			(layer: any) => layer.type === "symbol" && layer.layout?.["text-field"] != null,
		);
		map.addLayer(
			{
				id: HEATMAP_LAYER_ID,
				type: "heatmap",
				source: HEATMAP_SOURCE_ID,
				paint: { ...HEATMAP_PAINT, "heatmap-color": heatmapColor(accent) },
			},
			firstLabelLayer?.id,
		);
	} catch {
		// best-effort overlay; the picker still works without it
	}
}

/**
 * Builds the DOM for a place marker in the Right Now map's style (the
 * .fg-place rules in index.css): an icon bubble that pops in, a name plate
 * below it, and for highlighted places a rainbow ring.
 * The root is the bubble itself, so the marker is anchored on its center.
 */
export function createPlaceMarkerElement(place: MapPlace, onClick: () => void): HTMLDivElement {
	const el = document.createElement("div");
	el.className = "fg-place";
	if (place.highlight) el.dataset.kind = "neighbourhood";
	el.setAttribute("role", "button");
	el.setAttribute("aria-label", place.label);

	const pop = document.createElement("div");
	pop.className = "fg-place-pop";

	const bubble = document.createElement("div");
	bubble.className = "fg-place-bubble";
	const icon = document.createElement("div");
	icon.className = "fg-place-icon";
	icon.textContent = place.icon;
	bubble.appendChild(icon);

	const label = document.createElement("div");
	label.className = "fg-place-label";
	label.textContent = place.label;

	pop.append(bubble, label);
	el.appendChild(pop);
	// Stopped here so the map's own click handler doesn't also drop a pin
	// where the marker happens to be drawn.
	el.addEventListener("click", (event) => {
		event.stopPropagation();
		onClick();
	});
	return el;
}

export function isPlaceVisibleAtZoom(place: MapPlace, zoom: number): boolean {
	return zoom >= (place.minZoom ?? 0) && zoom < (place.maxZoom ?? Infinity);
}
