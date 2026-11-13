import { useEffect, useState } from "react";
import { useAuth } from "../contexts/useAuth";
import * as chatDb from "../services/chatDb";
import { GRID_HIDE_STATE_EVENT, type GridHideStateChangeDetail } from "../services/profileHide";

/**
 * Profiles the user hid (local-only, like the chat inbox's hidden-conversation
 * flag). Reloaded whenever the active account's chatDb becomes ready
 * (settingsReady), so switching accounts also switches which profiles are
 * hidden instead of leaking the previous account's set; kept in sync with
 * hide/unhide anywhere in the app through GRID_HIDE_STATE_EVENT.
 */
export function useHiddenProfileIds(): Set<string> {
	const { userId, settingsReady } = useAuth();
	const [hiddenProfileIds, setHiddenProfileIds] = useState<Set<string>>(() => new Set());

	useEffect(() => {
		if (!settingsReady) return;
		let cancelled = false;
		void chatDb.listHiddenProfileIds().then((ids) => {
			if (!cancelled) setHiddenProfileIds(new Set(ids));
		});
		return () => {
			cancelled = true;
		};
	}, [userId, settingsReady]);

	useEffect(() => {
		const onHideStateChange = (event: Event) => {
			const detail = (event as CustomEvent<GridHideStateChangeDetail>).detail;
			if (!detail) return;
			setHiddenProfileIds((previous) => {
				if (previous.has(detail.profileId) === detail.hidden) return previous;
				const next = new Set(previous);
				if (detail.hidden) next.add(detail.profileId);
				else next.delete(detail.profileId);
				return next;
			});
		};
		window.addEventListener(GRID_HIDE_STATE_EVENT, onHideStateChange as EventListener);
		return () => window.removeEventListener(GRID_HIDE_STATE_EVENT, onHideStateChange as EventListener);
	}, []);

	return hiddenProfileIds;
}
