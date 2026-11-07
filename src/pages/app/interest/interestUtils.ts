import type { TFunction } from "i18next";
import { formatRelativeTime } from "../../../utils/relativeTime";
import type { StoredInterestView } from "../../../services/interestViewsStore";
import { validateMediaHash, extractMediaHashFromUrl } from "../../../utils/media";
import type { BrowseCard } from "../GridPage.types";

export type InterestTab = "views" | "taps" | "sent";

export type InterestItem = {
	profileId: string;
	displayName: string | null;
	imageHash: string | null;
	timestamp: number | null;
	tapType: number | null;
	viewCount: number | null;
	canOpenProfile: boolean;
	isFromCache?: boolean;
	isMutual?: boolean;
	isRead?: boolean;
	onlineUntil?: number | null;
	rightNow?: string | null;
	/** Received taps and views (also locked previews); null when hidden. */
	distanceMeters?: number | null;
	/** Views only: the API's own favorite flag (also sent for locked previews). */
	isFavorite?: boolean | null;
	/** How a locked preview was matched to a real profile; "distance" is a guess. */
	recoveredBy?: "hash" | "event" | "distance" | null;
};

export const PREVIEW_ID_PREFIX = "preview:";

export function fromStoredView(row: StoredInterestView): InterestItem {
	return {
		profileId: row.profileId,
		displayName: row.displayName,
		imageHash: row.imageHash,
		timestamp: row.timestamp ?? row.updatedAt,
		tapType: null,
		viewCount: row.viewCount,
		canOpenProfile: !row.profileId.startsWith(PREVIEW_ID_PREFIX),
		distanceMeters: row.distanceMeters ?? null,
		isFavorite: row.isFavorite ?? null,
		recoveredBy: row.recoveredBy ?? null,
		isFromCache: true,
	};
}

export function toStoredView(item: InterestItem): Omit<StoredInterestView, "updatedAt"> {
	return {
		profileId: item.profileId,
		displayName: item.displayName ?? "",
		imageHash: item.imageHash,
		timestamp: item.timestamp,
		viewCount: item.viewCount,
		distanceMeters: item.distanceMeters ?? null,
		isFavorite: item.isFavorite ?? null,
		recoveredBy: item.recoveredBy ?? null,
	};
}

function isPlaceholderName(name: string | null, profileId: string): boolean {
	return name === `Profile ${profileId}`;
}

function mergeViewItem(
	cached: InterestItem | null,
	incoming: InterestItem,
): InterestItem {
	if (!cached) {
		return incoming;
	}

	const incomingLooksPlaceholder = isPlaceholderName(
		incoming.displayName,
		incoming.profileId,
	);

	const isIncomingPreview = incoming.profileId.startsWith(PREVIEW_ID_PREFIX);
	const isCachedPreview = cached.profileId.startsWith(PREVIEW_ID_PREFIX);

	return {
		// Prefer real ID over preview ID
		profileId: isIncomingPreview && !isCachedPreview ? cached.profileId : incoming.profileId,
		displayName:
			incomingLooksPlaceholder && !isPlaceholderName(cached.displayName, cached.profileId)
				? cached.displayName
				: incoming.displayName,
		imageHash: incoming.imageHash ?? cached.imageHash,
		timestamp: incoming.timestamp ?? cached.timestamp,
		tapType: incoming.tapType ?? cached.tapType,
		viewCount: incoming.viewCount ?? cached.viewCount,
		canOpenProfile: incoming.canOpenProfile || cached.canOpenProfile,
		isFromCache: incoming.isFromCache ?? cached.isFromCache,
		isMutual: incoming.isMutual ?? cached.isMutual,
		onlineUntil: incoming.onlineUntil ?? cached.onlineUntil,
		rightNow: incoming.rightNow ?? cached.rightNow,
		distanceMeters: incoming.distanceMeters ?? cached.distanceMeters,
		isFavorite: incoming.isFavorite ?? cached.isFavorite,
		recoveredBy: incoming.recoveredBy ?? cached.recoveredBy,
	};
}

export function asObject(value: unknown): Record<string, unknown> | null {
	if (typeof value !== "object" || value === null) {
		return null;
	}
	return value as Record<string, unknown>;
}

function toStringId(value: unknown): string | null {
	if (typeof value === "string" && value.trim().length > 0) {
		return value;
	}
	if (typeof value === "number" && Number.isFinite(value)) {
		return String(value);
	}
	return null;
}

export function toNumber(value: unknown): number | null {
	if (typeof value === "number" && Number.isFinite(value)) {
		return value;
	}
	if (typeof value === "string" && value.trim().length > 0) {
		const parsed = Number(value);
		if (Number.isFinite(parsed)) {
			return parsed;
		}
	}
	return null;
}

function getItemDisplayName(entry: Record<string, unknown>): string | null {
	const value = entry.displayName;
	if (typeof value === "string" && value.trim().length > 0) {
		return value;
	}
	return null;
}

function getItemImageHash(entry: Record<string, unknown>): string | null {
	const candidates = [entry.profileImageMediaHash, entry.photoHash, entry.mediaHash];
	for (const candidate of candidates) {
		if (typeof candidate === "string" && validateMediaHash(candidate)) {
			return candidate;
		}
	}
	return null;
}

function getItemRightNow(entry: Record<string, unknown>): string | null {
	return typeof entry.rightNow === "string" ? entry.rightNow : null;
}

function getItemFavorite(entry: Record<string, unknown>): boolean | null {
	return typeof entry.isFavorite === "boolean" ? entry.isFavorite : null;
}

function getItemTimestamp(entry: Record<string, unknown>): number | null {
	return (
		toNumber(entry.timestamp) ??
		toNumber(entry.sentOn) ??
		toNumber(entry.readOn) ??
		toNumber(entry.lastViewedAt) ??
		toNumber(entry.lastViewed) ??
		toNumber(entry.seen)
	);
}

function getViewEntryRecord(entry: unknown): Record<string, unknown> | null {
	const obj = asObject(entry);
	if (!obj) {
		return null;
	}

	const nestedCandidates = [obj.profile, obj.preview, obj.viewer, obj.user];
	for (const candidate of nestedCandidates) {
		const nested = asObject(candidate);
		if (nested) {
			return {
				...obj,
				...nested,
			};
		}
	}

	return obj;
}

function getViewProfileId(entry: Record<string, unknown>): string | null {
	return (
		toStringId(entry.profileId) ??
		toStringId(entry.viewerProfileId) ??
		toStringId(entry.id)
	);
}

function getPreviewSyntheticId(
	entry: Record<string, unknown>,
	index: number,
): string {
	const hash = typeof entry.profileImageMediaHash === "string" ? entry.profileImageMediaHash : "nohash";
	if (hash !== "nohash") {
		// Keep preview IDs stable across refreshes for the same hash.
		return `${PREVIEW_ID_PREFIX}${hash}`;
	}
	const seen = toNumber(entry.lastViewed) ?? toNumber(entry.seen) ?? toNumber(entry.timestamp) ?? 0;
	return `${PREVIEW_ID_PREFIX}${hash}:${seen}:${index}`;
}

export type BrowseHashMatch = {
	profileId: string;
	displayName: string | null;
	onlineUntil: number | null;
	rightNow: string | null;
};

/** A `viewed_me` WebSocket event: names the real viewer behind a locked preview. */
export type ViewEventMatch = {
	profileId: string;
	imageHash: string | null;
	timestamp: number;
};

// The WS event's timestamp and the preview's lastViewed describe the same view;
// allow a little skew, but only accept a match that points at one profile.
const VIEW_EVENT_MATCH_TOLERANCE_MS = 5000;

function findViewEventMatch(item: InterestItem, viewEvents: ViewEventMatch[]): ViewEventMatch | null {
	if (item.timestamp == null || viewEvents.length === 0) return null;
	const timestamp = item.timestamp;
	const candidates = viewEvents.filter(
		(event) =>
			Math.abs(event.timestamp - timestamp) <= VIEW_EVENT_MATCH_TOLERANCE_MS &&
			// A known, different photo rules the event out.
			(!item.imageHash || !event.imageHash || event.imageHash === item.imageHash),
	);
	if (new Set(candidates.map((event) => event.profileId)).size !== 1) return null;
	return candidates.reduce((best, event) =>
		Math.abs(event.timestamp - timestamp) < Math.abs(best.timestamp - timestamp) ? event : best,
	);
}

/** A photo-less profile seen in the browse grid, with its exact distance. */
export type DistanceCandidate = BrowseHashMatch & {
	distanceMeters: number;
	favorite: boolean | null;
};

// Both distances are measured from our own position, so they only agree while
// neither side moved much; keep the window tight and demand a single candidate.
function distanceTolerance(meters: number): number {
	return Math.max(30, meters * 0.005);
}

function findDistanceMatch(
	item: InterestItem,
	candidates: DistanceCandidate[],
	takenIds: Set<string>,
): DistanceCandidate | null {
	if (item.distanceMeters == null || candidates.length === 0) return null;
	const distance = item.distanceMeters;
	const tolerance = distanceTolerance(distance);
	const matches = candidates.filter((candidate) => {
		if (takenIds.has(candidate.profileId)) return false;
		if (Math.abs(candidate.distanceMeters - distance) > tolerance) return false;
		// Contradicting attributes rule a candidate out.
		if (item.isFavorite != null && candidate.favorite != null && item.isFavorite !== candidate.favorite) return false;
		const itemRightNow = item.rightNow === "HOSTING" || item.rightNow === "NOT_HOSTING" ? item.rightNow : null;
		const candidateRightNow = candidate.rightNow === "HOSTING" || candidate.rightNow === "NOT_HOSTING" ? candidate.rightNow : null;
		if (item.rightNow != null && candidate.rightNow != null && itemRightNow !== candidateRightNow) return false;
		return true;
	});
	return new Set(matches.map((m) => m.profileId)).size === 1 ? matches[0] : null;
}

function isHashlessPreview(item: InterestItem): boolean {
	return item.profileId.startsWith(PREVIEW_ID_PREFIX) && !item.imageHash;
}

export function normalizeViews(
	payload: unknown,
	previouslyCached: InterestItem[],
	_t: TFunction,
	identityByHash?: Map<string, BrowseHashMatch>,
	viewEvents: ViewEventMatch[] = [],
	distanceCandidates: DistanceCandidate[] = [],
): InterestItem[] {
	const root = asObject(payload);
	if (!root) return previouslyCached;
	const dataRoot = asObject(root.data);

	const profilesRaw = Array.isArray(root.profiles) ? root.profiles : Array.isArray(dataRoot?.profiles) ? dataRoot.profiles : [];
	const previewsRaw = Array.isArray(root.previews) ? root.previews : Array.isArray(dataRoot?.previews) ? dataRoot.previews : [];

	// 1. Normalize raw data from server
	const incomingProfiles = profilesRaw.map((entry): InterestItem | null => {
		const obj = getViewEntryRecord(entry);
		if (!obj) return null;
		const profileId = getViewProfileId(obj);
		if (!profileId) return null;
		return {
			profileId,
			displayName: getItemDisplayName(obj),
			imageHash: getItemImageHash(obj),
			timestamp: getItemTimestamp(obj),
			tapType: null,
			viewCount: toNumber(asObject(obj.viewedCount)?.totalCount),
			canOpenProfile: true,
			isFromCache: false,
			onlineUntil: toNumber(obj.onlineUntil),
			rightNow: getItemRightNow(obj),
			distanceMeters: toNumber(obj.distance),
			isFavorite: getItemFavorite(obj),
		};
	}).filter((it): it is InterestItem => it !== null);

	const incomingPreviews = previewsRaw.map((entry, index): InterestItem | null => {
		const obj = getViewEntryRecord(entry);
		if (!obj) return null;
		const realId = getViewProfileId(obj);
		return {
			profileId: realId ?? getPreviewSyntheticId(obj, index),
			displayName: null,
			imageHash: getItemImageHash(obj),
			timestamp: getItemTimestamp(obj),
			tapType: null,
			viewCount: toNumber(asObject(obj.viewedCount)?.totalCount),
			canOpenProfile: realId !== null,
			isFromCache: false,
			onlineUntil: toNumber(obj.onlineUntil),
			rightNow: getItemRightNow(obj),
			// Distance and favorite are sent for locked previews too.
			distanceMeters: toNumber(obj.distance),
			isFavorite: getItemFavorite(obj),
		};
	}).filter((it): it is InterestItem => it !== null);

	// 2. Merging: cache (history) first, then fresh server entries on top.
	const mergedMap = new Map<string, InterestItem>();
	for (const item of previouslyCached) {
		mergedMap.set(item.profileId, item);
	}
	for (const incoming of [...incomingProfiles, ...incomingPreviews]) {
		const existing = mergedMap.get(incoming.profileId);
		mergedMap.set(incoming.profileId, mergeViewItem(existing ?? null, incoming));
	}

	// Hashless previews get a position-based synthetic ID, so the same view
	// could pile up under several IDs across refreshes — keep one per timestamp.
	const hashlessByTimestamp = new Map<number, string>();
	for (const [id, item] of mergedMap) {
		if (!isHashlessPreview(item) || item.timestamp == null) continue;
		const keptId = hashlessByTimestamp.get(item.timestamp);
		if (keptId) {
			mergedMap.set(keptId, { ...mergeViewItem(mergedMap.get(keptId) ?? null, item), profileId: keptId });
			mergedMap.delete(id);
		} else {
			hashlessByTimestamp.set(item.timestamp, id);
		}
	}

	// 3. Identity index (photo hash → profile). Weakest first: persisted/browse
	// hints from the caller, then known interest entries, then this response.
	const hashToProfile = new Map<string, BrowseHashMatch>();
	if (identityByHash) {
		for (const [hash, match] of identityByHash) hashToProfile.set(hash, match);
	}
	for (const item of [...previouslyCached, ...incomingProfiles]) {
		if (item.imageHash && !item.profileId.startsWith(PREVIEW_ID_PREFIX)) {
			hashToProfile.set(item.imageHash, {
				profileId: item.profileId,
				displayName: item.displayName,
				onlineUntil: item.onlineUntil ?? null,
				rightNow: item.rightNow ?? null,
			});
		}
	}
	const idToProfile = new Map<string, BrowseHashMatch>();
	for (const match of hashToProfile.values()) {
		const known = idToProfile.get(match.profileId);
		if (!known || (!known.displayName && match.displayName)) idToProfile.set(match.profileId, match);
	}

	// 4. Recover still-locked previews — fresh and cached alike — by photo
	// hash, else by the view event that named the viewer at that time, else
	// (photo-less previews only) by a unique photo-less grid profile at the
	// same distance. A profile appears once in the views list, so IDs already
	// in it can't be behind another preview.
	const takenIds = new Set(Array.from(mergedMap.keys()).filter((id) => !id.startsWith(PREVIEW_ID_PREFIX)));
	for (const [id, item] of Array.from(mergedMap)) {
		if (!id.startsWith(PREVIEW_ID_PREFIX)) continue;
		const byHash = item.imageHash ? hashToProfile.get(item.imageHash) : undefined;
		const byEvent = byHash ? null : findViewEventMatch(item, viewEvents);
		const byDistance =
			byHash || byEvent || item.imageHash ? null : findDistanceMatch(item, distanceCandidates, takenIds);
		const profileId = byHash?.profileId ?? byEvent?.profileId ?? byDistance?.profileId;
		if (!profileId) continue;
		const known = byHash ?? byDistance ?? idToProfile.get(profileId);
		const recoveredBy = byHash ? "hash" : byEvent ? "event" : "distance";
		takenIds.add(profileId);

		const recovered: InterestItem = {
			...item,
			profileId,
			displayName: known?.displayName ?? null,
			canOpenProfile: true,
			isFromCache: true,
			recoveredBy,
			// Fresh presence from the response wins over the (possibly stale) match.
			onlineUntil: item.onlineUntil ?? known?.onlineUntil ?? null,
			rightNow: item.rightNow ?? known?.rightNow ?? null,
		};
		mergedMap.delete(id);

		const existing = mergedMap.get(profileId);
		if (!existing) {
			mergedMap.set(profileId, recovered);
			continue;
		}
		// An entry for that profile already exists: it wins, the recovered
		// preview only fills gaps and can carry a newer view time.
		const merged = mergeViewItem(recovered, existing);
		merged.displayName = existing.displayName ?? recovered.displayName;
		merged.timestamp = Math.max(existing.timestamp ?? 0, recovered.timestamp ?? 0) || null;
		mergedMap.set(profileId, merged);
	}

	// Drop locked previews whose hash now belongs to a real profile (e.g. a
	// cached twin of a profile that's unlocked now).
	const realHashes = new Set<string>();
	for (const item of mergedMap.values()) {
		if (item.imageHash && !item.profileId.startsWith(PREVIEW_ID_PREFIX)) {
			realHashes.add(item.imageHash);
		}
	}
	for (const [id, item] of mergedMap) {
		if (id.startsWith(PREVIEW_ID_PREFIX) && item.imageHash && realHashes.has(item.imageHash)) {
			mergedMap.delete(id);
		}
	}

	return Array.from(mergedMap.values()).sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
}

export function normalizeTaps(payload: unknown, _t: TFunction): InterestItem[] {
	const root = asObject(payload);
	if (!root || !Array.isArray(root.profiles)) return [];

	const mergedMap = new Map<string, InterestItem>();

	for (const entry of root.profiles) {
		const obj = asObject(entry);
		if (!obj) continue;
		const profileId = toStringId(obj.profileId) ?? toStringId(obj.senderId);
		if (!profileId) continue;

		const incoming: InterestItem = {
			profileId,
			displayName: getItemDisplayName(obj),
			imageHash: getItemImageHash(obj),
			timestamp: getItemTimestamp(obj),
			tapType: toNumber(obj.tapType),
			viewCount: null,
			canOpenProfile: true,
			isMutual: obj.isMutual === true || obj.mutual === true,
			onlineUntil: toNumber(obj.onlineUntil),
			rightNow: getItemRightNow(obj),
			distanceMeters: toNumber(obj.distance),
		};

		const existing = mergedMap.get(profileId);
		// For taps, we prefer the one with the newer timestamp if duplicates exist
		if (!existing || (incoming.timestamp ?? 0) > (existing.timestamp ?? 0)) {
			mergedMap.set(profileId, incoming);
		}
	}

	return Array.from(mergedMap.values()).sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
}

/**
 * The sent-taps endpoint only returns bare IDs (no name/photo), unlike
 * received taps/views which come back pre-enriched. Recover a display name
 * and image the same way locked view-previews are recovered — by matching
 * against profiles already seen in the browse grid — keyed by profile ID
 * here since we already have a real ID, not just an image hash.
 */
export function normalizeSentTaps(
	payload: unknown,
	browseIdIndex?: Map<string, BrowseCard>,
): InterestItem[] {
	const rows = Array.isArray(payload) ? payload : [];

	const mergedMap = new Map<string, InterestItem>();

	for (const entry of rows) {
		const obj = asObject(entry);
		if (!obj) continue;
		if (obj.deleted === true) continue;

		const profileId = toStringId(obj.receiverId);
		if (!profileId) continue;

		const match = browseIdIndex?.get(profileId);
		const imageHash = match?.primaryImageUrl ? extractMediaHashFromUrl(match.primaryImageUrl) : null;

		const incoming: InterestItem = {
			profileId,
			displayName: match?.displayName ?? null,
			imageHash,
			timestamp: toNumber(obj.sentOn),
			tapType: toNumber(obj.tapType),
			viewCount: null,
			canOpenProfile: true,
			// Not a "recovered" entry — the endpoint always gives us the real
			// receiver ID; the cache only fills in name/photo.
			isFromCache: false,
			isRead: obj.readOn != null,
			onlineUntil: match?.onlineUntil ?? null,
			rightNow: match?.rightNow ?? null,
		};

		const existing = mergedMap.get(profileId);
		if (!existing || (incoming.timestamp ?? 0) > (existing.timestamp ?? 0)) {
			mergedMap.set(profileId, incoming);
		}
	}

	return Array.from(mergedMap.values()).sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
}

const PROFILE_LOOKUP_CHUNK_SIZE = 50;

/**
 * Resolves display name/photo for sent-tap entries the browse-grid cache
 * couldn't identify, via the same bulk cascade endpoint (POST /v3/profiles)
 * SettingsBlockedPage/SharedAlbumsPage use to enrich id-only lists. Chunked
 * to 50 ids per request; a failed chunk just leaves its entries id-only
 * rather than failing the whole list.
 */
export async function enrichSentTapsWithProfiles(
	items: InterestItem[],
	getProfilesByIds: (profileIds: (string | number)[]) => Promise<unknown>,
	shouldResolve: (item: InterestItem) => boolean = () => true,
): Promise<InterestItem[]> {
	// Locked previews have no real ID to look up.
	const unresolvedIds = items
		.filter((item) => !item.displayName && !item.profileId.startsWith(PREVIEW_ID_PREFIX) && shouldResolve(item))
		.map((item) => item.profileId);
	if (unresolvedIds.length === 0) return items;

	const chunks: string[][] = [];
	for (let i = 0; i < unresolvedIds.length; i += PROFILE_LOOKUP_CHUNK_SIZE) {
		chunks.push(unresolvedIds.slice(i, i + PROFILE_LOOKUP_CHUNK_SIZE));
	}

	const detailsById = new Map<string, { displayName: string | null; imageHash: string | null }>();
	await Promise.all(
		chunks.map(async (chunk) => {
			try {
				const raw = await getProfilesByIds(chunk);
				const profiles = asObject(raw)?.profiles;
				if (!Array.isArray(profiles)) return;
				for (const entry of profiles) {
					const obj = asObject(entry);
					if (!obj) continue;
					const profileId = toStringId(obj.profileId);
					if (!profileId) continue;
					detailsById.set(profileId, {
						displayName: getItemDisplayName(obj),
						imageHash: getItemImageHash(obj),
					});
				}
			} catch {
				// Chunk failed — its entries stay id-only below.
			}
		}),
	);

	if (detailsById.size === 0) return items;

	return items.map((item) => {
		const details = detailsById.get(item.profileId);
		if (!details) return item;
		return {
			...item,
			displayName: details.displayName ?? item.displayName,
			imageHash: details.imageHash ?? item.imageHash,
		};
	});
}

export function formatTimestamp(
	timestamp: number | null,
	t: TFunction,
	now: number = Date.now(),
): string {
	const formatted = formatRelativeTime(timestamp, now, "short");
	return formatted || t("interest_page.unknown_time");
}

export function tapLabel(tapType: number | null, t: TFunction): string {
	switch (tapType) {
		case 0:
			return t("interest_page.tap_labels.friendly");
		case 1:
			return t("interest_page.tap_labels.hot");
		case 2:
			return t("interest_page.tap_labels.looking");
		default:
			return t("interest_page.tap_labels.default");
	}
}

export function getTapEmoji(tapType: number | null): string {
	switch (tapType) {
		case 0:
			return "👋";
		case 1:
			return "🔥";
		case 2:
			return "😈";
		default:
			return "🔥";
	}
}
