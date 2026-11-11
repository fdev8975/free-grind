import { useEffect, useState } from "react";
import type { TFunction } from "i18next";
import { Hourglass } from "lucide-react";

/** Translation key of a timed album share's length, or null (ONCE, indefinite, unknown). */
export function getAlbumShareDurationKey(expirationType: unknown): string | null {
	if (expirationType === "TEN_MINUTES" || expirationType === 2) return "chat.expiration.ten_minutes";
	if (expirationType === "ONE_HOUR" || expirationType === 3) return "chat.expiration.one_hour";
	if (expirationType === "ONE_DAY" || expirationType === 4) return "chat.expiration.one_day";
	return null;
}

/**
 * An album share's expiry with the animated hourglass: "Once", the time
 * left, or — for a share whose clock hasn't started — how long it lasts.
 * Nothing once it ran out. `inline` drops the pill, for use inside a badge;
 * `compact` leaves out the "remaining" after the time left.
 */
export function AlbumExpirationCountdown({ expiresAt, isOnce, durationLabel = null, t, className = "mt-1", inline = false, compact = false }: { expiresAt: number; isOnce?: boolean; durationLabel?: string | null; t: TFunction; className?: string; inline?: boolean; compact?: boolean }) {
	const [timeLeft, setTimeLeft] = useState<number>(expiresAt - Date.now());

	useEffect(() => {
		if (isOnce) return;
		// Right away too: a share opened meanwhile gets its expiry only now.
		setTimeLeft(expiresAt - Date.now());
		const timer = setInterval(() => {
			const next = expiresAt - Date.now();
			setTimeLeft(next);
			if (next <= 0) clearInterval(timer);
		}, 1000);
		return () => clearInterval(timer);
	}, [expiresAt, isOnce]);

	// Not opened yet: its clock starts on the first view, so show how long it lasts.
	const pendingLabel = !isOnce && expiresAt <= 0 ? durationLabel : null;
	if (!isOnce && !pendingLabel && timeLeft <= 0) return null;

	const seconds = Math.floor((timeLeft / 1000) % 60);
	const minutes = Math.floor((timeLeft / (1000 * 60)) % 60);
	const hours = Math.floor((timeLeft / (1000 * 60 * 60)) % 24);
	const days = Math.floor(timeLeft / (1000 * 60 * 60 * 24));

	const parts = [];
	if (days > 0) parts.push(t("right_now.days_short", { count: days }));
	if (hours > 0 || days > 0) parts.push(t("right_now.hours_short", { count: hours }));
	if (minutes > 0 || hours > 0 || days > 0) parts.push(t("right_now.minutes_short", { count: minutes }));
	if (days === 0 && hours === 0) parts.push(t("right_now.seconds_short", { count: seconds }));

	return (
		<>
			<style>
				{`
					@keyframes hourglass-rotate {
						0% { transform: rotate(0deg); }
						40% { transform: rotate(180deg); }
						60% { transform: rotate(180deg); }
						100% { transform: rotate(360deg); }
					}
					.animate-hourglass-rotate {
						animation: hourglass-rotate 2.5s infinite ease-in-out;
					}
				`}
			</style>
			{inline ? (
				<span className={`inline-flex items-center gap-1 uppercase tracking-wide text-[var(--accent)] ${className}`}>
					<Hourglass className="h-3 w-3 animate-hourglass-rotate" />
					<span>
						{isOnce ? t("chat.expiration.once") : pendingLabel ?? (compact ? parts.join(" ") : `${parts.join(" ")} ${t("chat.expiration.remaining")}`)}
					</span>
				</span>
			) : (
				<div className={`flex items-center ${className}`}>
					<span className="inline-flex items-center gap-1.5 rounded-full bg-black/50 py-1 ps-1.5 pe-2.5 text-[11px] font-semibold tracking-wide text-[var(--accent)] shadow-[0_2px_8px_rgba(0,0,0,0.3)] backdrop-blur-md uppercase">
						<Hourglass className="h-3 w-3 animate-hourglass-rotate" />
						<span>
							{isOnce ? t("chat.expiration.once") : pendingLabel ?? (compact ? parts.join(" ") : `${parts.join(" ")} ${t("chat.expiration.remaining")}`)}
						</span>
					</span>
				</div>
			)}
		</>
	);
}
