import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../contexts/useAuth";
import { usePreferences } from "../contexts/PreferencesContext";
import { RIGHT_NOW_ACTIVE_POST_KEY, useActiveRightNowPost } from "../hooks/queries/useRightNowQueries";
import { runningRightNowSession } from "../types/right-now";

type LocalSession = { activeRightNowId: number | null; activeRightNowExpiresAt: number | null; activeRightNowHidden: boolean };

const sameSession = (a: LocalSession, b: LocalSession) =>
	a.activeRightNowId === b.activeRightNowId &&
	a.activeRightNowExpiresAt === b.activeRightNowExpiresAt &&
	a.activeRightNowHidden === b.activeRightNowHidden;

/**
 * Keeps the locally stored Right Now session (id, expiry, paused) in line
 * with the server's running post (GET /v3/rightnow/active-post), so a session
 * started, paused, resumed, edited or expired on another device shows up here
 * too. Test mode runs on simulated posts and is left alone.
 */
export function RightNowSessionBridge() {
	const { userId, isLoading: isAuthLoading } = useAuth();
	const { setPreferences, activeRightNowId, activeRightNowExpiresAt, activeRightNowHidden, rightNowTestMode } = usePreferences();
	const queryClient = useQueryClient();
	const enabled = !isAuthLoading && !rightNowTestMode;
	const { data: post, dataUpdatedAt, isSuccess } = useActiveRightNowPost(userId, enabled);

	const local: LocalSession = {
		activeRightNowId: activeRightNowId ?? null,
		activeRightNowExpiresAt: activeRightNowExpiresAt ?? null,
		activeRightNowHidden: activeRightNowHidden ?? false,
	};
	const localRef = useRef(local);
	localRef.current = local;
	/** What this bridge last wrote, to tell its own writes from local changes. */
	const appliedRef = useRef<LocalSession | null>(null);
	/** When the local session last changed other than through this bridge. */
	const localChangedAtRef = useRef(0);

	// A local change (post created or edited here, per-profile state loaded
	// from storage) asks the server again; answers from before it are ignored.
	useEffect(() => {
		if (!enabled) return;
		if (appliedRef.current && sameSession(appliedRef.current, localRef.current)) return;
		localChangedAtRef.current = Date.now();
		void queryClient.invalidateQueries({ queryKey: RIGHT_NOW_ACTIVE_POST_KEY });
	}, [enabled, activeRightNowId, activeRightNowExpiresAt, activeRightNowHidden, queryClient]);

	useEffect(() => {
		if (!enabled || !isSuccess || post === undefined) return;
		if (dataUpdatedAt < localChangedAtRef.current) return;
		const session = runningRightNowSession(post);
		const next: LocalSession = session
			? { activeRightNowId: session.id, activeRightNowExpiresAt: session.expiresAt, activeRightNowHidden: session.hidden }
			: { activeRightNowId: null, activeRightNowExpiresAt: null, activeRightNowHidden: false };
		if (sameSession(localRef.current, next)) return;
		appliedRef.current = next;
		void setPreferences(next);
	}, [enabled, isSuccess, post, dataUpdatedAt, setPreferences]);

	return null;
}
