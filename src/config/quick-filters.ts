// Boolean filters that can be pinned as quick filter pills above a list, per
// screen. Order here is the order they're listed in the editor sheet.

export const GRID_QUICK_FILTER_KEYS = [
	"favorites",
	"onlineOnly",
	"isVisiting",
	"rightNow",
	"photoOnly",
	"faceOnly",
	"hasAlbum",
	"notRecentlyChatted",
	"fresh",
	"hot",
	"shuffle",
] as const;
export type GridQuickFilterKey = (typeof GRID_QUICK_FILTER_KEYS)[number];
export const DEFAULT_GRID_QUICK_FILTERS: readonly GridQuickFilterKey[] = ["favorites", "onlineOnly", "isVisiting", "rightNow"];

export const INBOX_QUICK_FILTER_KEYS = [
	"unreadOnly",
	"needsReplyOnly",
	"favoritesOnly",
	"onlineNowOnly",
	"rightNowOnly",
	"chemistryOnly",
] as const;
export type InboxQuickFilterKey = (typeof INBOX_QUICK_FILTER_KEYS)[number];
export const DEFAULT_INBOX_QUICK_FILTERS: readonly InboxQuickFilterKey[] = ["unreadOnly", "favoritesOnly", "onlineNowOnly", "rightNowOnly"];

export const RIGHT_NOW_QUICK_FILTER_KEYS = ["hostingOnly", "favoritesOnly"] as const;
export type RightNowQuickFilterKey = (typeof RIGHT_NOW_QUICK_FILTER_KEYS)[number];
export const DEFAULT_RIGHT_NOW_QUICK_FILTERS: readonly RightNowQuickFilterKey[] = ["hostingOnly"];

export type QuickFilterScope = "grid" | "inbox" | "rightNow";
