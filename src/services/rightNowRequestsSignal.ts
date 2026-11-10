/**
 * "New Right Now request" signal for the nav dot. Set by the
 * rightnow.v1.request WebSocket event (ChatRealtimeBridge), cleared once the
 * Right Now page is opened. Kept per account in localStorage so the dot
 * survives a reload until it's been seen.
 */
export const RIGHT_NOW_REQUESTS_CHANGED_EVENT = "fg:right-now-requests-changed";

const key = (userId: string | number) => `fg-rn-requests-unseen:${userId}`;

export function hasUnseenRightNowRequests(userId: string | number | null | undefined): boolean {
	if (userId == null) return false;
	try {
		return window.localStorage.getItem(key(userId)) === "1";
	} catch {
		return false;
	}
}

function set(userId: string | number, unseen: boolean): void {
	try {
		if (unseen) window.localStorage.setItem(key(userId), "1");
		else window.localStorage.removeItem(key(userId));
	} catch {
		// Storage unavailable: the in-memory event below still updates the dot.
	}
	window.dispatchEvent(new CustomEvent<{ unseen: boolean }>(RIGHT_NOW_REQUESTS_CHANGED_EVENT, { detail: { unseen } }));
}

export function markRightNowRequestsUnseen(userId: string | number): void {
	set(userId, true);
}

export function markRightNowRequestsSeen(userId: string | number): void {
	if (!hasUnseenRightNowRequests(userId)) return;
	set(userId, false);
}
