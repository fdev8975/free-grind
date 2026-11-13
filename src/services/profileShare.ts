/**
 * profileShare.ts — "Share" on a profile (grid/favorites tile, inbox row):
 * the profile waiting for ShareProfileBridge's chat picker, which sends it
 * as a ProfileLink message to the chats picked there.
 *
 * Upstream only ever sends ProfileLink itself; the Free Grind server lets
 * users send it while the `chat-profile-links` flag is on, so the action is
 * offered only then (and never against Grindr's server, which has no such
 * flag).
 */

import { useSyncExternalStore } from "react";
import { useFeatureFlag } from "./assignmentsStore";

export const PROFILE_LINKS_FLAG = "chat-profile-links";

export type ProfileShareRequest = {
	profileId: number;
	/** What the picker shows; the server takes name and photo from the profile itself. */
	name: string | null;
	mediaHash: string | null;
};

let pending: ProfileShareRequest | null = null;
const listeners = new Set<() => void>();

function emit() {
	for (const listener of listeners) listener();
}

export function requestProfileShare(request: ProfileShareRequest): void {
	pending = request;
	emit();
}

export function clearProfileShareRequest(): void {
	pending = null;
	emit();
}

function subscribe(listener: () => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export function useProfileShareRequest(): ProfileShareRequest | null {
	return useSyncExternalStore(subscribe, () => pending);
}

export function useCanShareProfiles(): boolean {
	return useFeatureFlag(PROFILE_LINKS_FLAG);
}
