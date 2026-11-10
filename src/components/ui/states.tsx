import { AlertCircle, Inbox, Loader2, RefreshCw } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { Card } from "./card";
import { Button } from "./button";
import { cn } from "../../utils/cn";

/** Full-page empty state for a feed (grid, Interest tabs, Right Now): a glowing
 * icon badge, title and hint, centred in the free space. Same look as the
 * inbox's "No chats" (DrawerEmptyState without the tile stack). */
export function FeedEmptyState({
	icon,
	title,
	description,
	color = "var(--accent)",
	contrastColor = "var(--accent-contrast)",
	action,
	className,
}: {
	icon: ReactNode;
	title: string;
	description?: string;
	/** Badge fill and glow. */
	color?: string;
	/** Icon color on the badge. */
	contrastColor?: string;
	action?: ReactNode;
	className?: string;
}) {
	return (
		<div
			className={cn("flex flex-col items-center justify-center gap-5 px-[var(--app-px)] py-12 text-center", className)}
			style={{ minHeight: "min(60dvh, 32rem)", "--feed-state-color": color } as CSSProperties}
		>
			<div className="relative h-24 w-32">
				{/* Soft glow from the gradient alone, no blur filter. */}
				<div
					aria-hidden="true"
					className="pointer-events-none absolute -inset-x-10 -inset-y-6"
					style={{ background: "radial-gradient(closest-side, color-mix(in srgb, var(--feed-state-color) 24%, transparent), transparent)" }}
				/>
				<div className="absolute inset-0 flex items-center justify-center">
					<span
						className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--feed-state-color)] shadow-lg [&_svg]:h-7 [&_svg]:w-7"
						style={{ color: contrastColor, boxShadow: "0 10px 24px -6px color-mix(in srgb, var(--feed-state-color) 40%, transparent)" }}
					>
						{icon}
					</span>
				</div>
			</div>
			<div className="space-y-1">
				<p className="text-base font-semibold text-[var(--text)]">{title}</p>
				{description ? (
					<p className="mx-auto max-w-[18rem] text-sm leading-relaxed text-[var(--text-muted)]">{description}</p>
				) : null}
			</div>
			{action}
		</div>
	);
}

/** FeedEmptyState for a failed load: red badge, the error as the hint and a
 * retry pill in the page's color. */
export function FeedErrorState({
	title,
	description,
	onRetry,
	retryLabel = "Retry",
	color = "var(--accent)",
	className,
}: {
	title: string;
	description?: string;
	onRetry?: () => void;
	retryLabel?: string;
	/** Retry pill tint (the page's color). */
	color?: string;
	className?: string;
}) {
	return (
		<FeedEmptyState
			icon={<AlertCircle />}
			title={title}
			description={description}
			color="#ef4444"
			contrastColor="white"
			className={className}
			action={
				onRetry ? (
					<button
						type="button"
						onClick={onRetry}
						className="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-bold transition-all active:scale-95 hover:brightness-110"
						style={{
							color,
							borderColor: `color-mix(in srgb, ${color} 35%, transparent)`,
							backgroundColor: `color-mix(in srgb, ${color} 10%, transparent)`,
						}}
					>
						<RefreshCw className="h-4 w-4" />
						{retryLabel}
					</button>
				) : null
			}
		/>
	);
}

export function LoadingState({
	title = "Loading",
	description,
	compact = false,
}: {
	title?: string;
	description?: string;
	compact?: boolean;
}) {
	return (
		<Card variant="native" className={compact ? "p-4" : "p-5 sm:p-6"}>
			<div className="flex items-center gap-3">
				<Loader2 className="h-4 w-4 animate-spin text-[var(--text-muted)]" />
				<div>
					<p className="text-sm font-semibold">{title}</p>
					{description ? (
						<p className="text-sm text-[var(--text-muted)]">{description}</p>
					) : null}
				</div>
			</div>
		</Card>
	);
}

export function EmptyState({
	title,
	description,
	action,
}: {
	title: string;
	description?: string;
	action?: React.ReactNode;
}) {
	return (
		<Card variant="native" className="p-5 sm:p-6">
			<div className="flex items-start gap-3">
				<div className="rounded-xl ink-tint-8 p-2.5">
					<Inbox className="h-4 w-4 text-[var(--text-muted)]" />
				</div>
				<div className="grid gap-2">
					<p className="text-sm font-semibold">{title}</p>
					{description ? (
						<p className="text-sm text-[var(--text-muted)]">{description}</p>
					) : null}
					{action}
				</div>
			</div>
		</Card>
	);
}

export function ErrorState({
	title = "Something went wrong",
	description,
	onRetry,
	retryLabel = "Retry",
}: {
	title?: string;
	description?: string;
	onRetry?: () => void;
	retryLabel?: string;
}) {
	return (
		<Card variant="native" className="p-5 sm:p-6">
			<div className="flex items-start gap-3">
				<div className="rounded-xl bg-red-500/12 p-2.5 text-red-500">
					<AlertCircle className="h-4 w-4" />
				</div>
				<div className="grid gap-2">
					<p className="text-sm font-semibold">{title}</p>
					{description ? (
						<p className="text-sm text-[var(--text-muted)]">{description}</p>
					) : null}
					{onRetry ? (
						<Button onClick={onRetry} size="sm" className="w-fit">
							{retryLabel}
						</Button>
					) : null}
				</div>
			</div>
		</Card>
	);
}
