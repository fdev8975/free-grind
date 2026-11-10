import { useCallback, useEffect, useMemo, useRef } from "react";
import type { Map as MaplibreMap, Marker } from "maplibre-gl";
import { useTranslation } from "react-i18next";
import { usePreferences } from "../../../../contexts/PreferencesContext";
import { useProfilePhotoPrivacy, type ProfilePhotoPrivacy } from "../../../../hooks/useProfilePhotoPrivacy";
import type { BrowseCard } from "../../../../types/grid";
import { decodeGeohash } from "../../../../utils/geohash";
import { proxyMediaUrl } from "../../../../utils/mediaProxy";
import { setCrashContext } from "../../../../utils/crashContext";
import { formatDistance } from "../utils";
import { MAP_STYLE_DARK, applyDarkMapTheme, relaxRoadZoomThresholds } from "./mapStyles";

/**
 * Grid map view. Shows profiles that
 * share a map position — the point the server obfuscated (stable per user,
 * computed server-side). The client never learns the fuzz radius or the real
 * position, so nothing here can be used to narrow either down.
 * Reuses the Right Now marker styles (.rn-* in index.css).
 */

export type MapCard = BrowseCard & { fuzzedLat: number; fuzzedLon: number };

export function hasCardPosition(card: BrowseCard): card is MapCard {
	return (
		typeof card.fuzzedLat === "number" && Number.isFinite(card.fuzzedLat) &&
		typeof card.fuzzedLon === "number" && Number.isFinite(card.fuzzedLon)
	);
}

type Props = {
	cards: MapCard[];
	selectedProfileId: string | null;
	onSelectProfile: (profileId: string | null) => void;
	/**
	 * Explore mode: the pin the cascade is loaded around. A tap anywhere on the
	 * map moves it (onPlacePin); independent of the location picker's place.
	 */
	explorePin?: { lat: number; lon: number } | null;
	onPlacePin?: (point: { lat: number; lon: number }) => void;
	/** Height (px) covered by the page header at the top of the full-bleed map. */
	topInset: number;
	/** Width (px) covered by the desktop nav rail at the left of the map. */
	leftInset?: number;
};

const MARKER_SIZE = 44;
const MAX_PIXEL_RATIO = 2;
const MAX_TILE_CACHE_SIZE = 64;
const NAMEPLATE_ZOOM = 14;
const USER_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2c-4.42 0-8 2.24-8 5v1a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1c0-2.76-3.58-5-8-5Z"/></svg>`;

function isOnline(card: BrowseCard): boolean {
	return typeof card.onlineUntil === "number" && card.onlineUntil > Date.now();
}

function buildMarker(card: MapCard, label: string, privacy: ProfilePhotoPrivacy, onClick: () => void): HTMLDivElement {
	const el = document.createElement("div");
	el.className = "rn-marker";
	el.style.cssText = `width:${MARKER_SIZE}px;height:${MARKER_SIZE}px;cursor:pointer;`;
	const pop = document.createElement("div");
	pop.className = "rn-marker-pop";
	const inner = document.createElement("div");
	inner.className = "rn-marker-inner";
	const avatar = document.createElement("div");
	avatar.style.cssText =
		"position:absolute;inset:0;border-radius:9999px;border:2px solid var(--accent);background:var(--surface-2);color:var(--text-muted);box-shadow:0 4px 12px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;overflow:hidden;";
	if (card.primaryImageUrl && privacy !== "hide") {
		const img = document.createElement("img");
		img.src = proxyMediaUrl(card.primaryImageUrl);
		img.alt = "";
		img.draggable = false;
		img.style.cssText = `width:100%;height:100%;object-fit:cover;${privacy === "blur" ? "filter:blur(6px);transform:scale(1.1);" : ""}`;
		avatar.appendChild(img);
	} else {
		avatar.innerHTML = USER_ICON_SVG;
	}
	inner.appendChild(avatar);
	if (isOnline(card)) {
		const dot = document.createElement("div");
		dot.style.cssText = "position:absolute;bottom:-2px;right:-2px;width:12px;height:12px;border-radius:9999px;background:#22c55e;border:2px solid var(--bg);";
		inner.appendChild(dot);
	}
	if (label) {
		const plate = document.createElement("div");
		plate.className = "rn-nameplate";
		plate.textContent = label;
		inner.appendChild(plate);
	}
	pop.appendChild(inner);
	el.appendChild(pop);
	el.addEventListener("click", (event) => {
		event.stopPropagation();
		onClick();
	});
	return el;
}

function buildPinMarker(): HTMLDivElement {
	const el = document.createElement("div");
	el.style.cssText = "width:34px;height:44px;pointer-events:none;filter:drop-shadow(0 4px 8px rgba(0,0,0,0.45));";
	el.innerHTML = `<svg viewBox="0 0 24 32" width="34" height="44"><path d="M12 0C5.4 0 0 5.2 0 11.7 0 20.5 12 32 12 32s12-11.5 12-20.3C24 5.2 18.6 0 12 0Z" fill="var(--explore, #8b5cf6)"/><circle cx="12" cy="11.5" r="4.5" fill="#fff"/></svg>`;
	return el;
}

function buildYouMarker(label: string): HTMLDivElement {
	const el = document.createElement("div");
	el.className = "rn-radar";
	el.innerHTML = `<div class="rn-radar-ring"></div><div class="rn-radar-ring"></div><div class="rn-radar-dot"></div>`;
	const tag = document.createElement("div");
	tag.className = "rn-radar-label";
	tag.textContent = label;
	el.appendChild(tag);
	return el;
}

export function GridMap({ cards, selectedProfileId, onSelectProfile, explorePin = null, onPlacePin, topInset, leftInset = 0 }: Props) {
	const { t } = useTranslation();
	const { geohash, unitsPreset } = usePreferences();
	const privacy = useProfilePhotoPrivacy();
	const containerRef = useRef<HTMLDivElement | null>(null);
	const mapRef = useRef<MaplibreMap | null>(null);
	const maplibreRef = useRef<typeof import("maplibre-gl") | null>(null);
	const youRef = useRef<Marker | null>(null);
	const markersRef = useRef(new Map<string, { marker: Marker; signature: string }>());
	const cardsRef = useRef(cards);
	cardsRef.current = cards;
	const onSelectRef = useRef(onSelectProfile);
	onSelectRef.current = onSelectProfile;
	const onPlacePinRef = useRef(onPlacePin);
	onPlacePinRef.current = onPlacePin;
	const pinRef = useRef<Marker | null>(null);
	const explorePinRef = useRef(explorePin);
	explorePinRef.current = explorePin;
	const privacyRef = useRef(privacy);
	privacyRef.current = privacy;
	const insetsRef = useRef({ top: topInset, left: leftInset });
	insetsRef.current = { top: topInset, left: leftInset };
	const labelFor = useRef<(c: BrowseCard) => string>(() => "");
	labelFor.current = (c) => {
		const name = c.displayName?.trim() || t("common.unknown_display_name");
		const distance = c.distanceMeters != null ? formatDistance(c.distanceMeters, t, unitsPreset) : null;
		return distance ? `${name} · ${distance}` : name;
	};

	const ownCenter = useMemo<[number, number] | null>(() => {
		if (!geohash) return null;
		try {
			const { lat, lon } = decodeGeohash(geohash);
			return [(lon[0] + lon[1]) / 2, (lat[0] + lat[1]) / 2];
		} catch {
			return null;
		}
	}, [geohash]);
	const ownCenterRef = useRef(ownCenter);
	ownCenterRef.current = ownCenter;

	const syncMarkers = useCallback(() => {
		const map = mapRef.current;
		const maplibregl = maplibreRef.current;
		if (!map || !maplibregl) return;
		const markers = markersRef.current;
		const next = new Set<string>();
		for (const card of cardsRef.current) {
			const id = String(card.profileId);
			next.add(id);
			const label = labelFor.current(card);
			const signature = [card.fuzzedLat, card.fuzzedLon, card.primaryImageUrl ?? "", isOnline(card), label, privacyRef.current].join("|");
			const existing = markers.get(id);
			if (existing?.signature === signature) continue;
			existing?.marker.remove();
			const element = buildMarker(card, label, privacyRef.current, () => onSelectRef.current(id));
			markers.set(id, { marker: new maplibregl.Marker({ element, anchor: "center" }).setLngLat([card.fuzzedLon, card.fuzzedLat]).addTo(map), signature });
		}
		for (const [id, entry] of markers) {
			if (!next.has(id)) {
				entry.marker.remove();
				markers.delete(id);
			}
		}
		setCrashContext("gridMapMarkers", markers.size);
	}, []);

	const syncPin = useCallback(() => {
		const map = mapRef.current;
		const maplibregl = maplibreRef.current;
		if (!map || !maplibregl) return;
		const pin = explorePinRef.current;
		if (!pin) {
			pinRef.current?.remove();
			pinRef.current = null;
			return;
		}
		if (!pinRef.current) pinRef.current = new maplibregl.Marker({ element: buildPinMarker(), anchor: "bottom" }).setLngLat([pin.lon, pin.lat]).addTo(map);
		else pinRef.current.setLngLat([pin.lon, pin.lat]);
	}, []);

	const applySelection = useCallback((id: string | null) => {
		let any = false;
		for (const [markerId, entry] of markersRef.current) {
			const el = entry.marker.getElement();
			const selected = markerId === id;
			any ||= selected;
			const root = el.classList.contains("rn-marker") ? el : el.querySelector<HTMLElement>(".rn-marker");
			if (root) root.dataset.selected = selected ? "true" : "false";
			el.style.zIndex = selected ? "10" : "";
		}
		containerRef.current?.classList.toggle("rn-map-has-selection", any);
	}, []);

	useEffect(() => {
		let mounted = true;
		const container = containerRef.current;
		const init = async () => {
			try {
				const maplibregl = (await import("maplibre-gl")).default;
				await import("maplibre-gl/dist/maplibre-gl.css");
				if (!mounted || !containerRef.current || mapRef.current) return;
				maplibreRef.current = maplibregl;
				const first = cardsRef.current[0];
				const pin = explorePinRef.current;
				const start: [number, number] | null = pin ? [pin.lon, pin.lat] : (ownCenterRef.current ?? (first ? [first.fuzzedLon, first.fuzzedLat] : null));
				const map = new maplibregl.Map({
					container: containerRef.current,
					style: MAP_STYLE_DARK,
					center: start ?? [10, 50],
					zoom: start ? 13 : 3,
					attributionControl: false,
					pixelRatio: Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO),
					maxTileCacheSize: MAX_TILE_CACHE_SIZE,
				});
				map.on("style.load", () => {
					relaxRoadZoomThresholds(map);
					applyDarkMapTheme(map);
				});
				// Header and nav rail overlay the full-bleed map: keep the
				// visual center (and "You") in the uncovered part.
				map.setPadding({ top: insetsRef.current.top, left: insetsRef.current.left, right: 0, bottom: 0 });
				map.on("click", (event) => {
					onSelectRef.current(null);
					// Explore mode: a tap on the map (not on a profile) moves the pin there.
					onPlacePinRef.current?.({ lat: event.lngLat.lat, lon: event.lngLat.lng });
				});
				const updateZoomClass = () => containerRef.current?.classList.toggle("rn-map-zoomed", map.getZoom() >= NAMEPLATE_ZOOM);
				map.on("zoom", updateZoomClass);
				map.once("load", updateZoomClass);
				mapRef.current = map;
				setCrashContext("gridMap", "open");
				if (ownCenterRef.current) {
					const el = buildYouMarker(t("right_now.map_you", { defaultValue: "You" }));
					el.style.zIndex = "0";
					youRef.current = new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat(ownCenterRef.current).addTo(map);
				}
				syncMarkers();
				syncPin();
			} catch {
				// map stays blank; the list view is still available
			}
		};
		void init();
		const resizeObserver = "ResizeObserver" in window && container ? new ResizeObserver(() => mapRef.current?.resize()) : null;
		if (container) resizeObserver?.observe(container);
		const markers = markersRef.current;
		return () => {
			mounted = false;
			resizeObserver?.disconnect();
			for (const entry of markers.values()) entry.marker.remove();
			markers.clear();
			youRef.current?.remove();
			youRef.current = null;
			pinRef.current?.remove();
			pinRef.current = null;
			mapRef.current?.remove();
			mapRef.current = null;
			setCrashContext("gridMap", null);
			setCrashContext("gridMapMarkers", null);
		};
		// Created once; updates are applied to the live instance below.
	}, []);

	useEffect(() => {
		syncMarkers();
		applySelection(selectedProfileId);
	}, [cards, selectedProfileId, privacy, syncMarkers, applySelection]);

	useEffect(() => {
		syncPin();
	}, [explorePin?.lat, explorePin?.lon, syncPin]);

	useEffect(() => {
		mapRef.current?.setPadding({ top: topInset, left: leftInset, right: 0, bottom: 0 });
	}, [topInset, leftInset]);

	return (
		<div className="relative h-full w-full">
			<div ref={containerRef} className="absolute inset-0" style={{ isolation: "isolate" }} />
		</div>
	);
}
