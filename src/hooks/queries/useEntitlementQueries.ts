import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useApiFunctions } from "../useApiFunctions";
import { useAuth } from "../../contexts/useAuth";
import { useServerInfo } from "../../services/serverConfig";
import {
	isAllowanceExhausted,
	isUnlimitedAllowance,
	subscribeExpiringAllowanceStale,
	type ExpiringAllowance,
	type ExpiringMediaKind,
} from "../../services/expiringAllowance";
import type { RightNowEntitlements } from "../../types/right-now";

/**
 * Right Now post entitlement (GET /v1/rightnow/entitlements/posts). The
 * count depends on the browse location and refills over time, so it is keyed
 * by geohash and refreshed now and then.
 */
export function useEntitlements(userId: number | null, geohash: string | null, enabled = true) {
	const api = useApiFunctions();
	return useQuery<RightNowEntitlements>({
		queryKey: ["entitlements", userId, geohash],
		queryFn: () => api.getEntitlements(),
		staleTime: 10 * 60 * 1000,
		enabled: enabled && !!userId,
	});
}

/**
 * Expiring media allowance (GET /v4/{pics,videos,albums}/expiring/status),
 * per account and backend. Refreshed after every expiring send (see
 * markExpiringAllowanceStale) and when the period may have rolled over.
 */
export function useExpiringAllowance(kind: ExpiringMediaKind, enabled = true) {
	const api = useApiFunctions();
	const { userId } = useAuth();
	const { kind: serverKind } = useServerInfo();
	const queryClient = useQueryClient();
	useEffect(
		() =>
			subscribeExpiringAllowanceStale((stale) => {
				void queryClient.invalidateQueries({ queryKey: ["expiring-allowance", stale] });
			}),
		[queryClient],
	);
	return useQuery<ExpiringAllowance>({
		queryKey: ["expiring-allowance", kind, userId, serverKind],
		queryFn: () => api.getExpiringAllowance(kind),
		staleTime: 5 * 60 * 1000,
		retry: 1,
		enabled: enabled && userId != null,
	});
}

export type ExpiringAllowanceInfo = {
	/** Null while unknown (loading, failed): callers keep their old behaviour then. */
	allowance: ExpiringAllowance | null;
	/** Known and capped: worth showing a counter. */
	limited: boolean;
	exhausted: boolean;
	/** Used up and nothing gets past it: the Free Grind server, or expiring albums anywhere. */
	blocked: boolean;
	/** Used up on Grindr, where the Honduras bypass is offered on send. */
	needsBypass: boolean;
};

export function useExpiringAllowanceInfo(kind: ExpiringMediaKind, enabled = true): ExpiringAllowanceInfo {
	const { data } = useExpiringAllowance(kind, enabled);
	const { kind: serverKind } = useServerInfo();
	const allowance = enabled ? data ?? null : null;
	const limited = allowance !== null && !isUnlimitedAllowance(allowance);
	const exhausted = allowance !== null && isAllowanceExhausted(allowance);
	// Grindr refuses expiring album shares with no bypass (see chatService's shareAlbum).
	const bypassable = serverKind === "official" && kind !== "albums";
	return { allowance, limited, exhausted, blocked: exhausted && !bypassable, needsBypass: exhausted && bypassable };
}
