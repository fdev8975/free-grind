import { useMemo, type CSSProperties } from "react";
import { getTapEmoji } from "../../interest/interestUtils";

const EMBER_COUNT = 18;

// Per tap type: spark colors and the glow tint behind the emoji.
const BURST_THEMES: Record<number, { embers: string[]; glow: string }> = {
	0: { embers: ["#fffbe0", "#fff07a", "#ffd84a", "#ffc21a", "#ffa81a"], glow: "255, 205, 40" }, // 👋
	1: { embers: ["#fff3b0", "#ffd54a", "#ffa62b", "#ff7a1a", "#ff4d1a"], glow: "255, 140, 20" }, // 🔥
	2: { embers: ["#f5e1ff", "#e0a8ff", "#c06bff", "#a855f7", "#7c3aed"], glow: "168, 85, 247" }, // 😈
};

function createEmbers(colors: string[], count = EMBER_COUNT): CSSProperties[] {
	return Array.from({ length: count }, () => {
		// Fan out mostly upwards (-170°..-10°) with an extra upward drift, so
		// the sparks read as rising from the flame rather than exploding.
		const angle = (-170 + Math.random() * 160) * (Math.PI / 180);
		const distance = 30 + Math.random() * 45;
		const size = 3 + Math.random() * 4;
		const color = colors[Math.floor(Math.random() * colors.length)];
		return {
			width: size,
			height: size,
			marginLeft: -size / 2,
			marginTop: -size / 2,
			background: color,
			boxShadow: `0 0 ${size * 1.5}px ${size * 0.4}px ${color}`,
			"--dx": `${Math.cos(angle) * distance}px`,
			"--dy": `${Math.sin(angle) * distance - 20 - Math.random() * 25}px`,
			"--dur": `${0.6 + Math.random() * 0.45}s`,
			"--delay": `${0.05 + Math.random() * 0.15}s`,
		} as CSSProperties;
	});
}

// Short-lived tap burst overlay for a grid tile. Remount it (via `key`) to
// replay. With `theirTapId` (they already tapped us, so this tap is mutual)
// both emojis slide in from the sides and bump together, and the sparks mix
// both tap types' colors.
export function TileFlameBurst({ tapId, theirTapId = null }: { tapId: number; theirTapId?: number | null }) {
	const theme = BURST_THEMES[tapId] ?? BURST_THEMES[1];
	const theirTheme = theirTapId == null ? null : (BURST_THEMES[theirTapId] ?? BURST_THEMES[1]);
	const embers = useMemo(
		() => (theirTheme ? createEmbers([...theme.embers, ...theirTheme.embers], EMBER_COUNT * 2) : createEmbers(theme.embers)),
		[theme, theirTheme],
	);

	return (
		<div
			className="pointer-events-none absolute inset-0 z-20 overflow-hidden"
			style={{ "--burst-rgb": theme.glow } as CSSProperties}
			aria-hidden
		>
			<div className="tile-flame-glow absolute inset-0" />
			<div className="absolute left-1/2 top-1/2 h-0 w-0">
				{embers.map((style, i) => (
					<span key={i} className="tile-flame-ember absolute rounded-full" style={style} />
				))}
			</div>
			{theirTapId == null ? (
				<span className="tile-flame-emoji absolute left-1/2 top-1/2 text-5xl leading-none">{getTapEmoji(tapId)}</span>
			) : (
				<>
					<span
						className="tile-flame-meet absolute left-1/2 top-1/2 text-4xl leading-none"
						style={{ "--meet-side": "-1" } as CSSProperties}
					>
						{getTapEmoji(theirTapId)}
					</span>
					<span
						className="tile-flame-meet absolute left-1/2 top-1/2 text-4xl leading-none"
						style={{ "--meet-side": "1" } as CSSProperties}
					>
						{getTapEmoji(tapId)}
					</span>
				</>
			)}
		</div>
	);
}
