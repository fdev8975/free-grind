import { z } from "zod";
import type { RestFetcher } from "../../types/chat-service";
import { assertSuccess, parseJsonSafe } from "../apiHelpers";

const coordinatesSchema = z.object({ lat: z.number(), lng: z.number() });

const exploreLocationSchema = z.object({
	id: z.number(),
	// "City" | "Neighbourhood" — kept open so a new type doesn't break parsing.
	type: z.string(),
	name: z.string(),
	nameDecoration: z.string().nullish(),
	// 0 for top-level entries (cities).
	containedInId: z.number().nullish(),
	displayCoordinates: coordinatesSchema,
	exploreCascadeCoordinates: coordinatesSchema.nullish(),
});

const exploreLocationsResponseSchema = z.object({
	locations: z.array(exploreLocationSchema).nullish(),
});

const exploreHeatmapResponseSchema = exploreLocationsResponseSchema.extend({
	heatmaps: z
		.array(
			z.object({
				heatmapId: z.number(),
				coordinates: coordinatesSchema,
				intensity: z.number(),
			}),
		)
		.nullish(),
});

/** A curated explore spot: a city or a (gay) neighbourhood inside one. */
export interface ExploreLocation {
	id: number;
	type: "City" | "Neighbourhood" | (string & {});
	name: string;
	/** Usually the country's flag emoji. */
	nameDecoration: string | null;
	/** Id of the parent city, null for top-level entries. */
	parentId: number | null;
	lat: number;
	lon: number;
}

export interface ExploreHeatmapPoint {
	heatmapId: number;
	lat: number;
	lon: number;
	/** 1 (low) .. 5 (high) in practice. */
	intensity: number;
}

export interface ExploreHeatmapResult {
	locations: ExploreLocation[];
	points: ExploreHeatmapPoint[];
}

function toExploreLocation(raw: z.infer<typeof exploreLocationSchema>): ExploreLocation {
	const coordinates = raw.exploreCascadeCoordinates ?? raw.displayCoordinates;
	return {
		id: raw.id,
		type: raw.type,
		name: raw.name,
		nameDecoration: raw.nameDecoration || null,
		parentId: raw.containedInId ? raw.containedInId : null,
		lat: coordinates.lat,
		lon: coordinates.lng,
	};
}

export function createExploreHeatmapMethods(fetchRest: RestFetcher, t: (key: string, defaultValue?: string) => string) {
	return {
		/** Every curated city / neighbourhood Grindr offers in explore. */
		async getExploreLocations(): Promise<ExploreLocation[]> {
			const response = await fetchRest("/v1/explore_heatmaps/all_locations");
			await assertSuccess(response, t("api.errors.load_explore_locations", "Failed to load explore locations"));
			const parsed = exploreLocationsResponseSchema.parse((await parseJsonSafe(response)) ?? {});
			return (parsed.locations ?? []).map(toExploreLocation);
		},

		/**
		 * Heatmap points (and the curated locations) within a square of
		 * `searchSquareSide` degrees around the given point.
		 */
		async getExploreHeatmap(lat: number, lon: number, searchSquareSide = 0.25): Promise<ExploreHeatmapResult> {
			const response = await fetchRest("/v1/explore_heatmaps", {
				method: "POST",
				body: { coordinates: { lat, lng: lon }, searchSquareSide, includeHeatmaps: true },
			});
			await assertSuccess(response, t("api.errors.load_explore_heatmap", "Failed to load the heatmap"));
			const parsed = exploreHeatmapResponseSchema.parse((await parseJsonSafe(response)) ?? {});
			return {
				locations: (parsed.locations ?? []).map(toExploreLocation),
				points: (parsed.heatmaps ?? []).map(({ heatmapId, coordinates, intensity }) => ({
					heatmapId,
					lat: coordinates.lat,
					lon: coordinates.lng,
					intensity,
				})),
			};
		},
	};
}
