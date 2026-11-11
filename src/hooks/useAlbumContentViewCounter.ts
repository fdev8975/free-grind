import { useEffect, useRef } from "react";
import { useApiFunctions } from "./useApiFunctions";
import { useChatArchiveEnabled } from "../services/chatArchiveMode";
import { appLog } from "../utils/logger";

/**
 * Archive mode off: tells the server each time a received album's item is
 * actually looked at in the full-screen viewer (once per item per opening
 * of the album), the way the official app counts album views. Pass a null
 * albumId while no item is on screen; own albums aren't counted.
 */
export function useAlbumContentViewCounter(albumId: number | null, contentId: number | null | undefined, isOwn: boolean): void {
	const archive = useChatArchiveEnabled();
	const api = useApiFunctions();
	const countedRef = useRef<{ albumId: number | null; contentIds: Set<number> }>({ albumId: null, contentIds: new Set() });

	useEffect(() => {
		if (albumId == null) {
			// Viewer closed: the next opening counts again.
			countedRef.current = { albumId: null, contentIds: new Set() };
			return;
		}
		if (archive || isOwn || contentId == null) return;
		if (countedRef.current.albumId !== albumId) {
			countedRef.current = { albumId, contentIds: new Set() };
		}
		if (countedRef.current.contentIds.has(contentId)) return;
		countedRef.current.contentIds.add(contentId);
		void api.viewAlbumContent(albumId, contentId).catch((error) => {
			appLog.warn("[album] recording a content view failed", { albumId, contentId, error });
		});
	}, [albumId, contentId, isOwn, archive, api]);
}
