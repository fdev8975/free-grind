/**
 * savedAccountProfiles.ts — persists each account's display name and
 * profile-image media hash, keyed by profile id, so the account switcher
 * (SettingsPage) can show a real name/avatar instead of just the bare
 * email/profile id for accounts that aren't currently active.
 *
 * Deliberately separate from gridpage/cache.ts's caches: those are
 * session-scoped and wiped on every account switch (clearAllCaches), while
 * this is keyed by profile id from the start and meant to survive switches
 * — and it's only a display name plus a public CDN media hash (see
 * utils/media.ts), not sensitive credential data, so plain localStorage is
 * fine.
 *
 * The 75x75 thumb itself is kept too, as a data URI fetched while the
 * account is active: an inactive account's server (and session) isn't the
 * one media URLs resolve against, so its photo can't be loaded live. A few
 * KB per account; chatDb's avatar cache can't serve this as it's per account.
 */

import { useSyncExternalStore } from "react";
import { fetchAndEncode, toDataUri } from "./mediaStore";
import { demoProfileImageFor, isDemoProfileImagesEnabled } from "../utils/demoProfileImages";
import { getThumbImageUrl, validateMediaHash } from "../utils/media";

const STORAGE_KEY = "fg-saved-account-profiles";

export interface SavedAccountProfileCache {
	displayName: string | null;
	photoHash: string | null;
	/** Cached thumb of `photoHash` as a data URI, once fetched. */
	photoDataUri?: string | null;
}

type StoredProfiles = Record<string, SavedAccountProfileCache>;

let version = 0;
const listeners = new Set<() => void>();
const inFlight = new Set<string>();

function loadAll(): StoredProfiles {
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY);
		if (!raw) {
			return {};
		}
		const parsed: unknown = JSON.parse(raw);
		return parsed && typeof parsed === "object" ? (parsed as StoredProfiles) : {};
	} catch {
		return {};
	}
}

function saveAll(all: StoredProfiles): void {
	try {
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
	} catch {
		// Storage full/unavailable: the switcher just shows less.
	}
	version += 1;
	for (const listener of listeners) listener();
}

export function getSavedAccountProfile(profileId: string): SavedAccountProfileCache {
	return loadAll()[profileId] ?? { displayName: null, photoHash: null };
}

/**
 * Re-renders the caller whenever a saved profile changes (e.g. a thumb
 * finished caching). Read entries with getSavedAccountProfile.
 */
export function useSavedAccountProfiles(): void {
	useSyncExternalStore(
		(cb) => {
			listeners.add(cb);
			return () => listeners.delete(cb);
		},
		() => version,
	);
}

/** Records the hash and caches its thumb. Call only while `profileId` is the active account. */
export function setSavedAccountPhotoHash(profileId: string, hash: string | null): void {
	const all = loadAll();
	const prev = all[profileId];
	const unchanged = prev?.photoHash === hash;
	if (!unchanged) {
		all[profileId] = { ...prev, displayName: prev?.displayName ?? null, photoHash: hash, photoDataUri: null };
		saveAll(all);
	}
	if (unchanged && prev?.photoDataUri) return;
	if (hash) void cacheThumb(profileId, hash);
}

async function cacheThumb(profileId: string, hash: string): Promise<void> {
	// Demo pictures are never stored.
	if (!validateMediaHash(hash) || isDemoProfileImagesEnabled()) return;
	const key = `${profileId}:${hash}`;
	if (inFlight.has(key)) return;
	inFlight.add(key);
	try {
		const fetched = await fetchAndEncode(getThumbImageUrl(hash, "75x75"));
		if (!fetched) return;
		const all = loadAll();
		// Dropped or re-pointed meanwhile.
		if (all[profileId]?.photoHash !== hash) return;
		all[profileId] = { ...all[profileId], photoDataUri: toDataUri(fetched.mimeType, fetched.base64) };
		saveAll(all);
	} finally {
		inFlight.delete(key);
	}
}

export function setSavedAccountDisplayName(profileId: string, name: string | null): void {
	const all = loadAll();
	if (all[profileId]?.displayName === name) return;
	all[profileId] = { ...all[profileId], displayName: name, photoHash: all[profileId]?.photoHash ?? null };
	saveAll(all);
}

/**
 * Thumb for the switcher: the cached copy, else a live URL — which only
 * resolves for an account on the active server (until its thumb is cached).
 */
export function getSavedAccountThumbUrl(profile: SavedAccountProfileCache): string | null {
	const hash = profile.photoHash;
	if (!hash) return null;
	if (isDemoProfileImagesEnabled()) return demoProfileImageFor(hash);
	return profile.photoDataUri ?? getThumbImageUrl(hash, "75x75");
}

export function removeSavedAccountProfile(profileId: string): void {
	const all = loadAll();
	delete all[profileId];
	saveAll(all);
}
