import {
	interestSentTapsResponseSchema,
	interestTapsResponseSchema,
	interestViewsResponseSchema,
	type InterestSentTapsResponse,
	type InterestTapsResponse,
	type InterestViewsResponse,
} from "../../types/interest";
import type { TapResult } from "../../types/api-functions";
import type { RestFetcher } from "../../types/chat-service";
import { ApiFunctionError, assertSuccess, parseJsonSafe } from "../apiHelpers";

export function createInterestMethods(fetchRest: RestFetcher, t: (key: string) => string) {
	return {
		async getViews(): Promise<InterestViewsResponse> {
			const response = await fetchRest("/v7/views/list");
			await assertSuccess(response, t("api.errors.load_views"));
			return interestViewsResponseSchema.parse(await parseJsonSafe(response));
		},

		/** Views badge count; `mostRecent` names the latest viewer by real ID,
		 * also when the views list only returns them as a locked preview. */
		async getViewsEyeball(): Promise<{ profileId: string; imageHash: string | null; timestamp: number } | null> {
			const response = await fetchRest("/v6/views/eyeball");
			await assertSuccess(response, t("api.errors.load_views"));
			const body = (await parseJsonSafe(response)) as { mostRecent?: Record<string, unknown> | null } | null;
			const mostRecent = body?.mostRecent;
			const profileId = mostRecent?.profileId;
			const timestamp = Number(mostRecent?.timestamp);
			if ((typeof profileId !== "string" && typeof profileId !== "number") || !Number.isFinite(timestamp)) return null;
			const hash = mostRecent?.photoHash;
			return { profileId: String(profileId), imageHash: typeof hash === "string" && hash ? hash : null, timestamp };
		},

		async getTaps(): Promise<InterestTapsResponse> {
			const response = await fetchRest("/v2/taps/received");
			await assertSuccess(response, t("api.errors.load_taps"));
			return interestTapsResponseSchema.parse(await parseJsonSafe(response));
		},

		async getSentTaps(): Promise<InterestSentTapsResponse> {
			const response = await fetchRest("/v1/interactions/taps/sent");
			await assertSuccess(response, t("api.errors.load_taps"));
			return interestSentTapsResponseSchema.parse(await parseJsonSafe(response));
		},

		async tap(profileId: string | number, tapType: number = 0): Promise<TapResult> {
			const recipientId =
				typeof profileId === "number" ? profileId : Number(profileId);

			if (!Number.isFinite(recipientId)) {
				throw new ApiFunctionError(t("api.errors.invalid_profile_id"), 400, { profileId });
			}

			const response = await fetchRest("/v2/taps/add", {
				method: "POST",
				body: {
					recipientId,
					tapType,
				},
			});
			await assertSuccess(response, t("api.errors.send_tap"));

			const payload = await parseJsonSafe(response);
			const isMutual =
				typeof payload === "object" &&
				payload !== null &&
				"isMutual" in payload &&
				typeof (payload as { isMutual?: unknown }).isMutual === "boolean"
					? ((payload as { isMutual: boolean }).isMutual ?? false)
					: false;

			return { isMutual };
		},
	};
}
