import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useApiFunctions } from "../useApiFunctions";
import { useEffect } from "react";
import { TAP_RECEIVED_EVENT, VIEW_RECEIVED_EVENT } from "../../components/ChatRealtimeBridge";
import { interestViewsStore } from "../../services/interestViewsStore";
import { interestIdentityStore } from "../../services/interestIdentityStore";
import { listConversations, listProfileSnapshotIdentities } from "../../services/chatDb";
import {
	fromStoredView,
	toStoredView,
	normalizeViews,
	normalizeTaps,
	normalizeSentTaps,
	enrichSentTapsWithProfiles,
	PREVIEW_ID_PREFIX,
	type BrowseHashMatch,
	type InterestItem,
} from "../../pages/app/interest/interestUtils";
import { getAllCachedBrowseCardsByImageHash, getAllCachedBrowseCardsById } from "../../pages/app/gridpage/cache";
import { useTranslation } from "react-i18next";
import { DEFAULT_STALE_TIME_MS } from "../../config/ui-constants";

export function useInterestData() {
	const api = useApiFunctions();
	const queryClient = useQueryClient();
	const { t } = useTranslation();

	const query = useQuery({
		queryKey: ["interest", "list"],
		queryFn: async () => {
			// 1. Parallel fetch from API
			const [tapsResponse, viewsResponse, sentTapsResponse] = await Promise.all([
				api.getTaps(),
				api.getViews(),
				api.getSentTaps().catch(() => []),
			]);

			// 2. Load cached views from IndexedDB (persistence)
			const cachedRows = await interestViewsStore.getAll();
			const cachedViews = cachedRows.map(fromStoredView);

			// 3. Normalize & Merge, recovering locked preview entries via every
			// known photo → profile pair and the viewers named by WS view events.
			const normalizedTaps = normalizeTaps(tapsResponse, t);
			const [identityByHash, viewEvents] = await Promise.all([
				buildIdentityIndex(normalizedTaps),
				interestIdentityStore.getViewEvents().catch(() => []),
			]);
			const normalizedViews = await enrichSentTapsWithProfiles(
				normalizeViews(viewsResponse, cachedViews, t, identityByHash, viewEvents),
				api.getProfilesByIds,
				// Only recovered previews: unlocked viewers come with their name
				// (or genuinely have none), no need to re-ask every load.
				(item) => item.isFromCache === true,
			);
			// Learn from this load too: unlocked/recovered viewers and tappers.
			void interestIdentityStore.rememberHashes(
				[...normalizedViews, ...normalizedTaps]
					.filter((item) => !item.profileId.startsWith(PREVIEW_ID_PREFIX))
					.map((item) => ({ hash: item.imageHash, profileId: item.profileId, displayName: item.displayName })),
			);
			const cacheResolvedSentTaps = normalizeSentTaps(sentTapsResponse, getAllCachedBrowseCardsById());
			// Bulk-resolve anyone the browse-grid cache didn't recognize — the
			// sent-taps endpoint only returns bare ids, unlike received taps/views.
			const normalizedSentTaps = await enrichSentTapsWithProfiles(
				cacheResolvedSentTaps,
				api.getProfilesByIds,
			);

			// 4. Update persistence store with merged views, and drop cached rows
			// the merge evicted (locked previews resolved to a real profile) —
			// otherwise they come back from IndexedDB on the next load.
			await interestViewsStore.upsertMany(
				normalizedViews.map((item) => toStoredView(item))
			);
			const keptIds = new Set(normalizedViews.map((item) => item.profileId));
			await interestViewsStore.deleteMany(
				cachedViews.filter((item) => !keptIds.has(item.profileId)).map((item) => item.profileId)
			);

			return {
				taps: normalizedTaps,
				views: normalizedViews,
				sentTaps: normalizedSentTaps,
				// Extract viewedCount from the raw response for the UI
				viewedCount: (viewsResponse as any)?.totalViewers || (viewsResponse as any)?.data?.totalViewers || 0
			};
		},
		staleTime: DEFAULT_STALE_TIME_MS,
		refetchOnWindowFocus: true, // Auto-sync when app returns to foreground
	});

	// Handle WebSocket updates
	useEffect(() => {
		const handleUpdate = () => {
			// Invalidate query to trigger a background refetch
			queryClient.invalidateQueries({ queryKey: ["interest", "list"] });
		};

		window.addEventListener(TAP_RECEIVED_EVENT, handleUpdate);
		window.addEventListener(VIEW_RECEIVED_EVENT, handleUpdate);

		return () => {
			window.removeEventListener(TAP_RECEIVED_EVENT, handleUpdate);
			window.removeEventListener(VIEW_RECEIVED_EVENT, handleUpdate);
		};
	}, [queryClient]);

	return query;
}

const toMatch = (profileId: string, displayName: string | null): BrowseHashMatch => ({
	profileId,
	displayName,
	onlineUntil: null,
	rightNow: null,
});

/**
 * Photo hash → profile index for recovering locked view previews, weakest
 * source first so stronger ones override on collision: persisted hints,
 * opened-profile snapshots, chat partners, received taps, the live browse grid.
 */
async function buildIdentityIndex(taps: InterestItem[]): Promise<Map<string, BrowseHashMatch>> {
	const index = new Map<string, BrowseHashMatch>();
	const add = (hash: string | null | undefined, match: BrowseHashMatch) => {
		if (hash) index.set(hash, match);
	};

	const [persisted, snapshots, conversations] = await Promise.all([
		interestIdentityStore.getHashes().catch(() => []),
		listProfileSnapshotIdentities().catch(() => []),
		listConversations({ includeArchived: true }).catch(() => []),
	]);

	for (const row of persisted) add(row.hash, toMatch(row.profileId, row.displayName));
	for (const row of snapshots) add(row.imageHash, toMatch(row.profileId, row.displayName));
	for (const conversation of conversations) {
		const data = conversation.entry.data;
		for (const participant of data.participants ?? []) {
			const profileId = String(participant.profileId);
			const isOther = conversation.otherProfileId == null || conversation.otherProfileId === profileId;
			add(participant.primaryMediaHash, toMatch(profileId, isOther ? data.name?.trim() || null : null));
		}
	}
	for (const tap of taps) add(tap.imageHash, toMatch(tap.profileId, tap.displayName));
	for (const [hash, card] of getAllCachedBrowseCardsByImageHash()) {
		add(hash, {
			profileId: card.profileId,
			displayName: card.displayName ?? null,
			onlineUntil: card.onlineUntil ?? null,
			rightNow: card.rightNow ?? null,
		});
	}
	return index;
}
