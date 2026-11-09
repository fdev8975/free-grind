import { useMemo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Plane, Reply, ScanFace, Shuffle, Star } from "lucide-react";
import {
	CameraFilled,
	FlameFilled,
	FlaskConicalFilled,
	HomeFilled,
	ImagesFilled,
	MailFilled,
	MessageCircleXFilled,
	SparklesFilled,
} from "../icons/FilledIcons";
import { RightNowIcon } from "../icons/RightNowIcon";
import { usePreferences } from "../../contexts/PreferencesContext";
import {
	DEFAULT_GRID_QUICK_FILTERS,
	DEFAULT_INBOX_QUICK_FILTERS,
	DEFAULT_RIGHT_NOW_QUICK_FILTERS,
	GRID_QUICK_FILTER_KEYS,
	INBOX_QUICK_FILTER_KEYS,
	RIGHT_NOW_QUICK_FILTER_KEYS,
	type GridQuickFilterKey,
	type InboxQuickFilterKey,
	type QuickFilterScope,
	type RightNowQuickFilterKey,
} from "../../config/quick-filters";

export type QuickFilterDef<K extends string = string> = {
	key: K;
	label: string;
	/** Renders the icon at the given size classes (h-3.5 in pills, h-5 in the editor). */
	renderIcon: (className: string) => ReactNode;
	/** Tile color in the editor sheet. */
	iconClassName: string;
	/** Pills tied to Right Now use its brand color instead of the accent. */
	color: "accent" | "right-now";
	/** Grid only: Favorites and Right Now don't apply while exploring another location. */
	hiddenWhileExploring?: boolean;
};

const onlineDot = () => <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-green-500 shadow-sm" />;
const RIGHT_NOW_TILE = "bg-[var(--right-now-soft)] text-[var(--right-now)]";
const FAVORITES_TILE = "bg-amber-500/15 text-amber-400";

export function useGridQuickFilterDefs(): Record<GridQuickFilterKey, QuickFilterDef<GridQuickFilterKey>> {
	const { t } = useTranslation();
	return useMemo(
		() => ({
			favorites: { key: "favorites", label: t("browse_filters.options.favorites"), renderIcon: (c) => <Star className={`${c} fill-current`} />, iconClassName: FAVORITES_TILE, color: "accent", hiddenWhileExploring: true },
			onlineOnly: { key: "onlineOnly", label: t("browse_filters.options.online"), renderIcon: onlineDot, iconClassName: "bg-green-500/15 text-green-400", color: "accent" },
			isVisiting: { key: "isVisiting", label: t("profile_details.visiting"), renderIcon: (c) => <Plane className={`${c} fill-current`} />, iconClassName: "bg-sky-500/15 text-sky-400", color: "accent" },
			rightNow: { key: "rightNow", label: t("browse_filters.options.right_now"), renderIcon: (c) => <RightNowIcon className={c} />, iconClassName: RIGHT_NOW_TILE, color: "right-now", hiddenWhileExploring: true },
			photoOnly: { key: "photoOnly", label: t("browse_filters.options.photo"), renderIcon: (c) => <CameraFilled className={c} />, iconClassName: "bg-blue-500/15 text-blue-400", color: "accent" },
			faceOnly: { key: "faceOnly", label: t("browse_filters.options.face"), renderIcon: (c) => <ScanFace className={c} strokeWidth={2.5} />, iconClassName: "bg-indigo-500/15 text-indigo-400", color: "accent" },
			hasAlbum: { key: "hasAlbum", label: t("browse_filters.options.has_album"), renderIcon: (c) => <ImagesFilled className={c} />, iconClassName: "bg-violet-500/15 text-violet-400", color: "accent" },
			notRecentlyChatted: { key: "notRecentlyChatted", label: t("browse_filters.options.no_recent_chat"), renderIcon: (c) => <MessageCircleXFilled className={c} />, iconClassName: "bg-slate-500/15 text-slate-400", color: "accent" },
			fresh: { key: "fresh", label: t("browse_filters.options.fresh"), renderIcon: (c) => <SparklesFilled className={c} />, iconClassName: "bg-emerald-500/15 text-emerald-400", color: "accent" },
			hot: { key: "hot", label: t("browse_filters.options.hot"), renderIcon: (c) => <FlameFilled className={c} />, iconClassName: "bg-orange-500/15 text-orange-400", color: "accent" },
			shuffle: { key: "shuffle", label: t("browse_filters.options.shuffle"), renderIcon: (c) => <Shuffle className={c} strokeWidth={2.5} />, iconClassName: "bg-pink-500/15 text-pink-400", color: "accent" },
		}),
		[t],
	);
}

export function useInboxQuickFilterDefs(): Record<InboxQuickFilterKey, QuickFilterDef<InboxQuickFilterKey>> {
	const { t } = useTranslation();
	return useMemo(
		() => ({
			unreadOnly: { key: "unreadOnly", label: t("chat_filters.options.unread"), renderIcon: (c) => <MailFilled className={c} />, iconClassName: "bg-blue-500/15 text-blue-400", color: "accent" },
			needsReplyOnly: { key: "needsReplyOnly", label: t("chat_filters.options.needs_reply"), renderIcon: (c) => <Reply className={c} strokeWidth={2.5} />, iconClassName: "bg-teal-500/15 text-teal-400", color: "accent" },
			favoritesOnly: { key: "favoritesOnly", label: t("browse_filters.options.favorites"), renderIcon: (c) => <Star className={`${c} fill-current`} />, iconClassName: FAVORITES_TILE, color: "accent" },
			onlineNowOnly: { key: "onlineNowOnly", label: t("browse_filters.options.online"), renderIcon: onlineDot, iconClassName: "bg-green-500/15 text-green-400", color: "accent" },
			rightNowOnly: { key: "rightNowOnly", label: t("browse_filters.options.right_now"), renderIcon: (c) => <RightNowIcon className={c} />, iconClassName: RIGHT_NOW_TILE, color: "right-now" },
			chemistryOnly: { key: "chemistryOnly", label: t("chat_filters.options.chemistry"), renderIcon: (c) => <FlaskConicalFilled className={c} />, iconClassName: "bg-fuchsia-500/15 text-fuchsia-400", color: "accent" },
		}),
		[t],
	);
}

export function useRightNowQuickFilterDefs(): Record<RightNowQuickFilterKey, QuickFilterDef<RightNowQuickFilterKey>> {
	const { t } = useTranslation();
	return useMemo(
		() => ({
			hostingOnly: { key: "hostingOnly", label: t("right_now.hosting"), renderIcon: (c) => <HomeFilled className={c} />, iconClassName: RIGHT_NOW_TILE, color: "right-now" },
			favoritesOnly: { key: "favoritesOnly", label: t("browse_filters.options.favorites"), renderIcon: (c) => <Star className={`${c} fill-current`} />, iconClassName: FAVORITES_TILE, color: "right-now" },
		}),
		[t],
	);
}

/** Drops unknown/duplicate keys from a stored list, keeping its order. */
export function sanitizeQuickFilters<K extends string>(keys: readonly string[], allKeys: readonly K[]): K[] {
	const known = new Set<string>(allKeys);
	const seen = new Set<string>();
	const result: K[] = [];
	for (const key of keys) {
		if (known.has(key) && !seen.has(key)) {
			seen.add(key);
			result.push(key as K);
		}
	}
	return result;
}

/** Everything the editor sheet needs for one screen's quick filters. */
export function useQuickFilterScope(scope: QuickFilterScope) {
	const prefs = usePreferences();
	const gridDefs = useGridQuickFilterDefs();
	const inboxDefs = useInboxQuickFilterDefs();
	const rightNowDefs = useRightNowQuickFilterDefs();

	switch (scope) {
		case "grid":
			return {
				allKeys: GRID_QUICK_FILTER_KEYS as readonly string[],
				defaults: DEFAULT_GRID_QUICK_FILTERS as readonly string[],
				defs: gridDefs as Record<string, QuickFilterDef>,
				pinned: sanitizeQuickFilters(prefs.gridQuickFilters, GRID_QUICK_FILTER_KEYS) as string[],
				save: (next: string[]) => void prefs.setPreferences({ gridQuickFilters: sanitizeQuickFilters(next, GRID_QUICK_FILTER_KEYS) }),
			};
		case "inbox":
			return {
				allKeys: INBOX_QUICK_FILTER_KEYS as readonly string[],
				defaults: DEFAULT_INBOX_QUICK_FILTERS as readonly string[],
				defs: inboxDefs as Record<string, QuickFilterDef>,
				pinned: sanitizeQuickFilters(prefs.inboxQuickFilters, INBOX_QUICK_FILTER_KEYS) as string[],
				save: (next: string[]) => void prefs.setPreferences({ inboxQuickFilters: sanitizeQuickFilters(next, INBOX_QUICK_FILTER_KEYS) }),
			};
		case "rightNow":
			return {
				allKeys: RIGHT_NOW_QUICK_FILTER_KEYS as readonly string[],
				defaults: DEFAULT_RIGHT_NOW_QUICK_FILTERS as readonly string[],
				defs: rightNowDefs as Record<string, QuickFilterDef>,
				pinned: sanitizeQuickFilters(prefs.rightNowQuickFilters, RIGHT_NOW_QUICK_FILTER_KEYS) as string[],
				save: (next: string[]) => void prefs.setPreferences({ rightNowQuickFilters: sanitizeQuickFilters(next, RIGHT_NOW_QUICK_FILTER_KEYS) }),
			};
	}
}
