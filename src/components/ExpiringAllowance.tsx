import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { ExpiringAllowanceInfo } from "../hooks/queries/useEntitlementQueries";

/*
 * Shared bits for showing an expiring media allowance next to an expiry
 * choice (see services/expiringAllowance and useExpiringAllowanceInfo).
 */

/** The tighter of two allowances, for a toggle that sends both kinds (mixed photo + video selection). */
export function tighterAllowance(a: ExpiringAllowanceInfo, b: ExpiringAllowanceInfo): ExpiringAllowanceInfo {
	if (a.blocked || b.blocked) return a.blocked ? a : b;
	if (a.exhausted || b.exhausted) return a.exhausted ? a : b;
	if (a.limited && b.limited) return (a.allowance?.available ?? 0) <= (b.allowance?.available ?? 0) ? a : b;
	return b.limited ? b : a;
}

/** Hover text / toast for an allowance: what's left, or why it's used up. */
export function useAllowanceHint(info: ExpiringAllowanceInfo | undefined): string | null {
	const { t } = useTranslation();
	if (!info?.allowance || !info.limited) return null;
	if (info.blocked) {
		return t("expiring_allowance.exhausted_blocked", {
			defaultValue: "Expiring limit reached. You can't send more expiring media right now.",
		});
	}
	if (info.needsBypass) {
		return t("expiring_allowance.exhausted_bypass", {
			defaultValue: "Expiring limit reached. Grindr wants a subscription for more; sending offers the Honduras bypass.",
		});
	}
	return t("expiring_allowance.remaining", {
		defaultValue: "{{available}} of {{total}} expiring left",
		available: info.allowance.available,
		total: info.allowance.total,
	});
}

/** "2/3"-style counter inside an expiry pill, amber once used up. */
export function AllowanceCounter({ info }: { info: ExpiringAllowanceInfo | undefined }) {
	if (!info?.allowance || !info.limited) return null;
	return (
		<span
			className={`rounded-full px-1.5 py-0.5 text-[11px] font-semibold leading-none tabular-nums ${
				info.exhausted ? "bg-amber-500/20 text-amber-500" : "bg-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text-muted)]"
			}`}
		>
			{info.allowance.available}/{info.allowance.total}
		</span>
	);
}

/**
 * With nothing left and no way around it, an expiring choice would only fail
 * on send: fall back to unlimited. Runs when the allowance or the choice changes.
 */
export function useResetWhenBlocked(blocked: boolean, isExpiring: boolean, reset: () => void) {
	const resetRef = useRef(reset);
	resetRef.current = reset;
	useEffect(() => {
		if (blocked && isExpiring) resetRef.current();
	}, [blocked, isExpiring]);
}
