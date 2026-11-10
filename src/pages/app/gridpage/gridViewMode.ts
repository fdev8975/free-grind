/** List or map view of the browse grid, remembered per account (like Right Now's view mode). */
export type GridViewMode = "list" | "map";

function key(userId: number | string | null | undefined): string {
	return `grid-view-mode:${userId ?? "anon"}`;
}

export function readGridViewMode(userId: number | string | null | undefined): GridViewMode {
	try {
		return localStorage.getItem(key(userId)) === "map" ? "map" : "list";
	} catch {
		return "list";
	}
}

export function writeGridViewMode(userId: number | string | null | undefined, mode: GridViewMode): void {
	try {
		localStorage.setItem(key(userId), mode);
	} catch {
		// Storage unavailable (private mode, quota): the choice just isn't remembered.
	}
}
