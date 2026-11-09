import { useEffect, useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useApiFunctions } from "../useApiFunctions";
import type { ExploreHeatmapPoint, ExploreLocation } from "../../services/api/exploreHeatmapMethods";

/** The curated explore cities/neighbourhoods. Rarely changes, so it's loaded once per session. */
export function useExploreLocations(enabled = true) {
	const api = useApiFunctions();
	return useQuery<ExploreLocation[]>({
		queryKey: ["explore-locations"],
		queryFn: () => api.getExploreLocations(),
		staleTime: Infinity,
		gcTime: Infinity,
		retry: 1,
		enabled,
	});
}

// The endpoint answers for a square of SEARCH_SQUARE_SIDE degrees around a
// point. The map center is snapped to a grid finer than that square, so small
// pans reuse the cached cell instead of firing a request per frame of movement
// while consecutive cells still overlap.
const SEARCH_SQUARE_SIDE = 0.25;
const CELL_SIZE = 0.1;
/** Below this zoom the search square is a tiny speck of the view — not worth fetching. */
export const EXPLORE_HEATMAP_MIN_ZOOM = 9;

/**
 * Heatmap points around the given map viewport. Points of every cell fetched
 * while this hook is mounted are kept (deduplicated per heatmap), so panning
 * away and back doesn't make already-seen heat blink out and in again.
 */
export function useExploreHeatmap(viewport: { lat: number; lon: number; zoom: number } | null, enabled = true) {
	const api = useApiFunctions();
	const cell =
		viewport && viewport.zoom >= EXPLORE_HEATMAP_MIN_ZOOM
			? { lat: Math.round(viewport.lat / CELL_SIZE) * CELL_SIZE, lon: Math.round(viewport.lon / CELL_SIZE) * CELL_SIZE }
			: null;
	const cellKey = cell ? `${cell.lat.toFixed(1)},${cell.lon.toFixed(1)}` : null;

	const query = useQuery({
		queryKey: ["explore-heatmap", cellKey],
		queryFn: () => api.getExploreHeatmap(cell!.lat, cell!.lon, SEARCH_SQUARE_SIDE),
		enabled: enabled && cell != null,
		staleTime: 1000 * 60 * 10,
		retry: false,
		placeholderData: keepPreviousData,
	});

	// heatmapId → its points, merged across every response so far.
	const [heatmaps, setHeatmaps] = useState<ReadonlyMap<number, ExploreHeatmapPoint[]>>(() => new Map());
	useEffect(() => {
		const points = query.data?.points;
		if (!points?.length) return;
		setHeatmaps((previous) => {
			const next = new Map(previous);
			const replaced = new Set<number>();
			for (const point of points) {
				// A heatmap's points in this response replace any older copy of it.
				if (!replaced.has(point.heatmapId)) {
					replaced.add(point.heatmapId);
					next.set(point.heatmapId, []);
				}
				next.get(point.heatmapId)!.push(point);
			}
			return next;
		});
	}, [query.data]);

	const points = useMemo(() => [...heatmaps.values()].flat(), [heatmaps]);

	return { points, isFetching: query.isFetching, error: query.error };
}
