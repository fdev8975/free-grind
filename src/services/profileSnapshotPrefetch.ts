import { listProfileSnapshotIds, saveProfileSnapshot } from "./chatDb";
import { classifyProfileAccess } from "../utils/profileAccessStatus";
import type { ProfileDetail } from "../types/grid";
import { appLog } from "../utils/logger";

/** Max profiles fetched per call — the rest are picked up on the next call,
 * so a long backlog of views doesn't fire a burst of requests at once. */
const MAX_PER_RUN = 20;

const inFlight = new Set<string>();

/**
 * Persists a profile snapshot for a profile just loaded from the server —
 * called by the API layer on every GET /v7/profiles/:id, so the local
 * snapshot is always the most recent real copy. Skips the blocked/gone stub
 * so it never overwrites a good snapshot.
 */
export function rememberProfileSnapshot(profileId: string, profile: ProfileDetail): void {
	if (classifyProfileAccess(profile) !== "accessible") return;
	void saveProfileSnapshot(profileId, JSON.stringify(profile)).catch((error) => {
		appLog.warn("[profile-snapshot] save failed", profileId, error);
	});
}

/**
 * Loads (and thereby snapshots, see rememberProfileSnapshot) every given
 * profile that has no local snapshot yet, one at a time, best-effort — so it
 * can still be opened after either side blocks. Profiles that already have
 * one are not refetched; they're refreshed whenever something else loads them.
 */
export async function snapshotMissingProfiles(
	profileIds: string[],
	getProfileDetail: (profileId: string) => Promise<ProfileDetail>,
): Promise<void> {
	const unique = [...new Set(profileIds)].filter((id) => /^\d+$/.test(id) && !inFlight.has(id));
	if (unique.length === 0) return;

	let existing: Set<string>;
	try {
		existing = await listProfileSnapshotIds(unique);
	} catch {
		return;
	}
	const missing = unique.filter((id) => !existing.has(id) && !inFlight.has(id)).slice(0, MAX_PER_RUN);
	for (const id of missing) inFlight.add(id);

	try {
		for (const profileId of missing) {
			await getProfileDetail(profileId).catch((error) => {
				appLog.warn("[profile-snapshot] prefetch failed", profileId, error);
			});
		}
	} finally {
		for (const id of missing) inFlight.delete(id);
	}
}
