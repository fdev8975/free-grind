/**
 * Expiring media allowance: how many expiring photos / videos / album shares
 * the account may still send (GET /v4/{pics,videos,albums}/expiring/status,
 * `{ total, available }`). Grindr and the Free Grind server answer the same
 * shape; "unlimited" is 2147483647 for both fields, a disabled feature 0/0.
 *
 * Once it's used up the two backends differ: Grindr refuses the send with a
 * paywall error, which the Honduras bypass (entitlementBypass) can get
 * through for photos and videos — expiring albums have no bypass there. A
 * Free Grind server's limits are its own policy, with no way around them.
 */
import { z } from "zod";

export type ExpiringMediaKind = "pics" | "videos" | "albums";

export const expiringAllowanceSchema = z.object({
	total: z.number().int(),
	available: z.number().int(),
});

export type ExpiringAllowance = z.infer<typeof expiringAllowanceSchema>;

/** The "unlimited" value of both fields. */
export const UNLIMITED_ALLOWANCE = 2_147_483_647;

export function expiringAllowancePath(kind: ExpiringMediaKind): string {
	return `/v4/${kind}/expiring/status`;
}

export function isUnlimitedAllowance(allowance: ExpiringAllowance): boolean {
	return allowance.total >= UNLIMITED_ALLOWANCE || allowance.available >= UNLIMITED_ALLOWANCE;
}

export function isAllowanceExhausted(allowance: ExpiringAllowance): boolean {
	return !isUnlimitedAllowance(allowance) && allowance.available <= 0;
}

// --- staleness, so a send refreshes the counters wherever they're shown ---

const listeners = new Set<(kind: ExpiringMediaKind) => void>();

/** Called after an expiring send (or a refused one): the allowance changed. */
export function markExpiringAllowanceStale(kind: ExpiringMediaKind): void {
	for (const listener of listeners) listener(kind);
}

export function subscribeExpiringAllowanceStale(listener: (kind: ExpiringMediaKind) => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

/** Which allowance a chat message send draws from, if any. */
export function expiringKindOfMessage(type: string, body: Record<string, unknown> | null | undefined): ExpiringMediaKind | null {
	if (type === "ExpiringImage") return "pics";
	if (type === "Video" || type === "PrivateVideo") {
		// Every video goes out with a view count (999 999 at most, see videoMessageViews), so
		// any count may draw from the allowance; refreshing it after each one costs a GET.
		if (typeof body?.maxViews === "number" && body.maxViews < UNLIMITED_ALLOWANCE) return "videos";
	}
	return null;
}
