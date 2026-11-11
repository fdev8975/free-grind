import { useSyncExternalStore } from "react";

/**
 * Chat database (archive) mode — a dev option, on by default.
 *
 * On: the app keeps everything it ever saw (the long-standing behavior):
 * expiring photos/videos are fetched and stored the moment they arrive,
 * unsent messages keep their content, received albums are downloaded and
 * stay open-able after their share ends.
 *
 * Off: chat media behaves like the official API intends. Expiring
 * photos/videos are only fetched when tapped (each tap uses one view on the
 * server) and never stored, unsent messages show as unsent, and albums open
 * only while they're actually shared — nothing is downloaded ahead of time,
 * so a timed share's clock starts when it's first opened, not on arrival.
 * Content archived while the mode was on is hidden, not deleted.
 */

const STORAGE_KEY = "fg-chat-archive-mode";
const listeners = new Set<() => void>();

function readStored(): boolean {
	try {
		return window.localStorage.getItem(STORAGE_KEY) !== "off";
	} catch {
		return true;
	}
}

let enabled = readStored();

export function isChatArchiveEnabled(): boolean {
	return enabled;
}

export function setChatArchiveEnabled(next: boolean): void {
	if (next === enabled) return;
	enabled = next;
	try {
		if (next) window.localStorage.removeItem(STORAGE_KEY);
		else window.localStorage.setItem(STORAGE_KEY, "off");
	} catch {
		// Storage unavailable: the choice holds for this session only.
	}
	for (const listener of listeners) listener();
}

export function subscribeChatArchiveMode(listener: () => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

/** Whether archive mode is on; follows changes live. */
export function useChatArchiveEnabled(): boolean {
	return useSyncExternalStore(subscribeChatArchiveMode, isChatArchiveEnabled, isChatArchiveEnabled);
}
