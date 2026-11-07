import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

/** Tap ids as the API uses them: 0 = 👋, 1 = 🔥, 2 = 😈. */
export const tapEmoji = (id: number) => id === 0 ? "👋" : id === 2 ? "😈" : "🔥";
export const tapParticleColor = (id: number) => id === 0 ? "rgba(234,179,8,0.9)" : id === 2 ? "rgba(168,85,247,0.9)" : "rgba(249,115,22,0.9)";
export const tapGlow = (id: number) => id === 0 ? "drop-shadow(0 0 10px rgba(234,179,8,0.95))" : id === 2 ? "drop-shadow(0 0 10px rgba(168,85,247,0.95))" : "drop-shadow(0 0 10px rgba(249,115,22,0.95))";

type TapParticle = { dx: number; dy: number; size: number; dur: number; delay: number; emoji?: string; color?: string };

export type TapFlyBurstState = {
	id: number;
	/** Restarts the animation when it changes (e.g. Date.now()). */
	key: number;
	/** Where the emoji starts, as an offset from the screen center. */
	originDx: number;
	originDy: number;
	particles: TapParticle[];
	/** Set when the tap is mutual: the tap type they sent us. */
	theirTapId: number | null;
};

export function makeTapParticles(tapId?: number): TapParticle[] {
	const dots = Array.from({ length: 28 }, (_, i) => {
		const angle = (i / 28) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
		const dist = Math.random() * 280 + 160;
		return {
			dx: Math.cos(angle) * dist,
			dy: Math.sin(angle) * dist,
			size: Math.random() * 10 + 4,
			dur: Math.random() * 0.45 + 0.4,
			delay: Math.random() * 0.08 + 0.62,
		};
	});
	const eggplants = tapId === 2 ? Array.from({ length: 6 }, (_, i) => {
		const angle = (i / 6) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
		const dist = Math.random() * 260 + 140;
		return {
			dx: Math.cos(angle) * dist,
			dy: Math.sin(angle) * dist,
			size: 24,
			dur: Math.random() * 0.3 + 1.0,
			delay: Math.random() * 0.1 + 0.64,
			emoji: "🍆",
		};
	}) : [];
	return [...dots, ...eggplants];
}

// Mutual burst: more and farther particles, alternating between both tap
// types' colors, timed to the moment the two emojis collide.
function makeMutualTapParticles(tapId: number, theirTapId: number): TapParticle[] {
	return Array.from({ length: 44 }, (_, i) => {
		const angle = (i / 44) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
		const dist = Math.random() * 320 + 180;
		return {
			dx: Math.cos(angle) * dist,
			dy: Math.sin(angle) * dist,
			size: Math.random() * 11 + 4,
			dur: Math.random() * 0.5 + 0.45,
			delay: Math.random() * 0.08 + 0.78,
			color: tapParticleColor(i % 2 === 0 ? tapId : theirTapId),
		};
	});
}

/**
 * A burst starting from `el` (the button that sent the tap). Pass
 * `theirTapId` when they already tapped us, i.e. this tap makes it mutual.
 */
export function createTapFlyBurst(tapId: number, el: Element | null | undefined, theirTapId: number | null = null): TapFlyBurstState {
	const rect = el?.getBoundingClientRect();
	return {
		id: tapId,
		key: Date.now(),
		originDx: rect ? rect.left + rect.width / 2 - window.innerWidth / 2 : window.innerWidth / 2 - 110,
		originDy: rect ? rect.top + rect.height / 2 - window.innerHeight / 2 : window.innerHeight / 2 - 80,
		particles: theirTapId == null ? makeTapParticles(tapId) : makeMutualTapParticles(tapId, theirTapId),
		theirTapId,
	};
}

const MUTUAL_TAP_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * The tap type they sent us if a tap sent now would be mutual (they tapped us
 * within the last 24h, the same window the tap state and tile badge use),
 * else null. The burst starts before the tap request returns, so this is
 * decided from data already on hand rather than the API's isMutual.
 */
export function mutualTapIdFor(
	lastReceivedTapTimestamp: number | null | undefined,
	receivedTapType: number | null | undefined,
): number | null {
	if (typeof lastReceivedTapTimestamp !== "number" || !Number.isFinite(lastReceivedTapTimestamp)) return null;
	const ms = lastReceivedTapTimestamp < 1_000_000_000_000 ? lastReceivedTapTimestamp * 1000 : lastReceivedTapTimestamp;
	const age = Date.now() - ms;
	return age >= 0 && age < MUTUAL_TAP_WINDOW_MS ? (receivedTapType ?? 1) : null;
}

/** How long a burst runs; clear the state after this (see tapFlyBurstDuration). */
export const TAP_FLY_BURST_MS = 1400;
const MUTUAL_TAP_FLY_BURST_MS = 2300;

export function tapFlyBurstDuration(burst: TapFlyBurstState): number {
	return burst.theirTapId == null ? TAP_FLY_BURST_MS : MUTUAL_TAP_FLY_BURST_MS;
}

/**
 * The sent-tap effect: the emoji flies from its button to the screen center,
 * grows and fades, then bursts into particles. Portaled to <body> so it covers
 * the screen above any sheet or viewer.
 *
 * Mutual taps: their emoji flies in from the top to meet ours, the two
 * collide in the center and burst in both colors, and a short "You tapped
 * each other" label follows.
 */
export function TapFlyBurst({ burst }: { burst: TapFlyBurstState }) {
	const { t } = useTranslation();
	const mutual = burst.theirTapId != null;
	return createPortal(
		<>
			{burst.particles.map((p, i) => p.emoji ? (
				<span
					key={`p-${burst.key}-${i}`}
					className="animate-emoji-particle-rise"
					style={{
						left: "50%", top: "50%", opacity: 0,
						fontSize: `${p.size}px`, lineHeight: 1,
						filter: tapGlow(burst.id), zIndex: 202,
						"--dx": `${p.dx}px`, "--dy": `${p.dy}px`,
						"--dur": `${p.dur}s`, "--delay": `${p.delay}s`,
					} as CSSProperties}
				>{p.emoji}</span>
			) : (
				<div
					key={`p-${burst.key}-${i}`}
					className="animate-particle-rise"
					style={{
						left: "50%", top: "50%", opacity: 0,
						width: `${p.size}px`, height: `${p.size}px`,
						background: p.color ?? tapParticleColor(burst.id),
						boxShadow: `0 0 ${p.size * 3}px ${p.size}px ${p.color ?? tapParticleColor(burst.id)}`,
						zIndex: 202,
						"--dx": `${p.dx}px`, "--dy": `${p.dy}px`,
						"--dur": `${p.dur}s`, "--delay": `${p.delay}s`,
					} as CSSProperties}
				/>
			))}
			<span
				key={`emoji-${burst.key}`}
				className={`${mutual ? "animate-tap-fly-meet" : "animate-tap-fly-center"} fixed pointer-events-none`}
				style={{ left: "50%", top: "50%", zIndex: 201, filter: tapGlow(burst.id), "--tap-origin-dx": `${burst.originDx}px`, "--tap-origin-dy": `${burst.originDy}px`, "--tap-meet-dx": "34px" } as CSSProperties}
			>
				{tapEmoji(burst.id)}
			</span>
			{burst.theirTapId != null && (
				<>
					<span
						key={`their-emoji-${burst.key}`}
						className="animate-tap-fly-meet fixed pointer-events-none"
						style={{
							left: "50%", top: "50%", zIndex: 201, filter: tapGlow(burst.theirTapId),
							// Mirrors our emoji horizontally and comes in from the top.
							"--tap-origin-dx": `${-burst.originDx}px`,
							"--tap-origin-dy": `${-window.innerHeight / 2 + 80}px`,
							"--tap-meet-dx": "-34px",
						} as CSSProperties}
					>
						{tapEmoji(burst.theirTapId)}
					</span>
					<span
						key={`label-${burst.key}`}
						className="animate-tap-mutual-label fixed pointer-events-none whitespace-nowrap rounded-full bg-black/55 px-4 py-1.5 text-sm font-semibold text-white backdrop-blur-md"
						style={{ left: "50%", top: "calc(50% + 96px)", zIndex: 203 }}
					>
						{t("browse_page.tile_tap.mutual", { defaultValue: "You tapped each other" })}
					</span>
				</>
			)}
		</>,
		document.body,
	);
}
