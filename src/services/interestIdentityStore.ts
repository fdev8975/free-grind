import { appLog } from "../utils/logger";

/**
 * interestIdentityStore — persistent, per-account identity hints used to
 * recover locked "viewed me" previews:
 *
 * - `hashes`: photo media hash → profile ID, learned from every place a real
 *   profile shows up with its photo (browse grid, taps, unlocked viewers,
 *   recovered previews). Survives restarts, unlike the in-memory browse cache.
 * - `viewEvents`: the `viewed_me.v1.new_view_received` WebSocket event names
 *   the most recent viewer (real profile ID + timestamp) even when the views
 *   list itself only returns a locked preview — matched later by timestamp.
 *
 * Stays on-device, split per account like interestViewsStore.
 */

export type IdentityHashEntry = {
	hash: string;
	profileId: string;
	displayName: string | null;
	seenAt: number;
};

export type ViewEventEntry = {
	key: string;
	profileId: string;
	imageHash: string | null;
	timestamp: number;
	receivedAt: number;
};

const LEGACY_DB_NAME = "open-grind-identity";
const DB_VERSION = 1;
const HASH_STORE = "hashes";
const VIEW_EVENT_STORE = "viewEvents";

const MAX_HASHES = 5000;
const MAX_HASH_AGE_MS = 60 * 24 * 60 * 60 * 1000; // 60 days
const MAX_VIEW_EVENTS = 2000;
const MAX_VIEW_EVENT_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days, same as the views cache

let activeDbName = LEGACY_DB_NAME;
// hash → profileId already written this session, so repeated browse-grid
// pages don't rewrite the same rows.
const writtenThisSession = new Map<string, string>();

export function setActiveIdentityStoreUser(profileId: number | string | null): void {
	const next = profileId != null ? `open-grind-identity-${profileId}` : LEGACY_DB_NAME;
	if (next !== activeDbName) writtenThisSession.clear();
	activeDbName = next;
}

function openDatabase(): Promise<IDBDatabase | null> {
	if (typeof window === "undefined" || !("indexedDB" in window)) {
		return Promise.resolve(null);
	}
	return new Promise((resolve) => {
		try {
			const request = window.indexedDB.open(activeDbName, DB_VERSION);
			request.onupgradeneeded = () => {
				const db = request.result;
				if (!db.objectStoreNames.contains(HASH_STORE)) {
					db.createObjectStore(HASH_STORE, { keyPath: "hash" });
				}
				if (!db.objectStoreNames.contains(VIEW_EVENT_STORE)) {
					db.createObjectStore(VIEW_EVENT_STORE, { keyPath: "key" });
				}
			};
			request.onsuccess = () => resolve(request.result);
			request.onerror = (e) => {
				appLog.error("[identityStore] IDB Open Error", e);
				resolve(null);
			};
		} catch (err) {
			appLog.error("[identityStore] IDB Fatal Error", err);
			resolve(null);
		}
	});
}

function getAllFrom<T>(storeName: string): Promise<T[]> {
	return openDatabase().then((db) => {
		if (!db) return [];
		return new Promise<T[]>((resolve) => {
			const tx = db.transaction(storeName, "readonly");
			const request = tx.objectStore(storeName).getAll();
			request.onsuccess = () => {
				db.close();
				resolve((request.result as T[]) || []);
			};
			request.onerror = () => {
				db.close();
				resolve([]);
			};
		});
	});
}

/** Deletes rows past max age, then the oldest ones beyond the cap. */
function prune<T>(store: IDBObjectStore, getKey: (row: T) => IDBValidKey, getTime: (row: T) => number, maxAge: number, maxRows: number) {
	const request = store.getAll();
	request.onsuccess = () => {
		const rows = (request.result as T[]) || [];
		const now = Date.now();
		const fresh = rows.filter((row) => {
			if (now - getTime(row) > maxAge) {
				store.delete(getKey(row));
				return false;
			}
			return true;
		});
		if (fresh.length > maxRows) {
			fresh.sort((a, b) => getTime(b) - getTime(a));
			for (const row of fresh.slice(maxRows)) store.delete(getKey(row));
		}
	};
}

export type IdentityHint = { hash: string | null | undefined; profileId: string; displayName?: string | null };

export const interestIdentityStore = {
	/** Records hash → profile pairs. A null display name never wipes a known one. */
	async rememberHashes(hints: IdentityHint[]): Promise<void> {
		const fresh = hints.filter(
			(h): h is IdentityHint & { hash: string } =>
				!!h.hash && !!h.profileId && writtenThisSession.get(h.hash) !== h.profileId,
		);
		if (fresh.length === 0) return;
		const db = await openDatabase();
		if (!db) return;

		return new Promise((resolve) => {
			const tx = db.transaction(HASH_STORE, "readwrite");
			const store = tx.objectStore(HASH_STORE);
			const now = Date.now();
			for (const hint of fresh) {
				const read = store.get(hint.hash);
				read.onsuccess = () => {
					const existing = read.result as IdentityHashEntry | undefined;
					const sameProfile = existing?.profileId === hint.profileId;
					store.put({
						hash: hint.hash,
						profileId: hint.profileId,
						displayName: hint.displayName ?? (sameProfile ? existing?.displayName ?? null : null),
						seenAt: now,
					} satisfies IdentityHashEntry);
				};
			}
			prune<IdentityHashEntry>(store, (r) => r.hash, (r) => r.seenAt, MAX_HASH_AGE_MS, MAX_HASHES);
			tx.oncomplete = () => {
				for (const hint of fresh) writtenThisSession.set(hint.hash, hint.profileId);
				db.close();
				resolve();
			};
			tx.onerror = (e) => {
				appLog.error("[identityStore] rememberHashes failed", e);
				db.close();
				resolve();
			};
		});
	},

	async rememberViewEvent(event: { profileId: string; imageHash: string | null; timestamp: number }): Promise<void> {
		if (!event.profileId || !Number.isFinite(event.timestamp)) return;
		const db = await openDatabase();
		if (!db) return;

		return new Promise((resolve) => {
			const tx = db.transaction(VIEW_EVENT_STORE, "readwrite");
			const store = tx.objectStore(VIEW_EVENT_STORE);
			store.put({
				key: `${event.timestamp}:${event.profileId}`,
				profileId: event.profileId,
				imageHash: event.imageHash,
				timestamp: event.timestamp,
				receivedAt: Date.now(),
			} satisfies ViewEventEntry);
			prune<ViewEventEntry>(store, (r) => r.key, (r) => r.timestamp, MAX_VIEW_EVENT_AGE_MS, MAX_VIEW_EVENTS);
			tx.oncomplete = () => {
				db.close();
				resolve();
			};
			tx.onerror = (e) => {
				appLog.error("[identityStore] rememberViewEvent failed", e);
				db.close();
				resolve();
			};
		});
	},

	getHashes(): Promise<IdentityHashEntry[]> {
		return getAllFrom<IdentityHashEntry>(HASH_STORE);
	},

	getViewEvents(): Promise<ViewEventEntry[]> {
		return getAllFrom<ViewEventEntry>(VIEW_EVENT_STORE);
	},
};
