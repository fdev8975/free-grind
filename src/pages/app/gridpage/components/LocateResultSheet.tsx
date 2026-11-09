import { Copy, Navigation } from "lucide-react";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { openUrl } from "@tauri-apps/plugin-opener";
import { BottomSheet, SheetCloseButton, sheetButtonClass } from "../../../../components/ui/bottom-sheet";
import { NATIVE_SHEET_BG } from "../../../../components/ui/action-sheet";
import { isIos } from "../../../../services/saveMedia";
import { appLog } from "../../../../utils/logger";
import { formatDistanceForUnits } from "../../../../utils/units";
import { usePreferences } from "../../../../contexts/PreferencesContext";
import { MapLocationPreview } from "./MapLocationPreview";
import { MAP_SHEET_ICON_BUTTON_CLASS, MapSheetLayout, mapSheetProps } from "./MapSheetLayout";

export type LocateRoundResult = {
	round: number;
	lat: number;
	lon: number;
	errorMeters: number;
	failed: boolean;
};

export type LocateProgress = {
	status: "measuring" | "running" | "done" | "error" | "cancelled";
	/** True while the user's own server location is still being restored. */
	isRestoring: boolean;
	initialDistance: number | null;
	totalRounds: number;
	/** 0-based index of the round in progress. */
	round: number;
	/** Measurement points finished in the current round (0–3). */
	step: number;
	/** Current best estimate — the user's own position before round 1 finishes. */
	lat: number;
	lon: number;
	errorMeters: number | null;
	rounds: LocateRoundResult[];
	errorMessage: string | null;
};

type Props = {
	progress: LocateProgress;
	onClose: () => void;
	onCancel: () => void;
	isDesktop: boolean;
};

const POINTS_PER_ROUND = 3;

/** Overall progress of a run, 0–100 — shared by the sheet and the "Locating…" menu labels. */
export function locatePercent({ status, totalRounds, round, step }: LocateProgress): number {
	const totalSteps = Math.max(1, totalRounds * POINTS_PER_ROUND);
	const doneSteps = status === "done" ? totalSteps : round * POINTS_PER_ROUND + step;
	return Math.min(100, Math.round((doneSteps / totalSteps) * 100));
}

export function LocateResultSheet({ progress, onClose, onCancel, isDesktop }: Props) {
	const { t } = useTranslation();
	const { status, isRestoring, lat, lon, errorMeters, totalRounds, round, step, rounds } = progress;
	const isRunning = status === "measuring" || status === "running";
	const hasEstimate = rounds.some((r) => !r.failed);
	const coords = `${lat.toFixed(6)}, ${lon.toFixed(6)}`;

	const percent = locatePercent(progress);

	const { unitsPreset } = usePreferences();

	// Short headline; the longer text (round info, error reason) goes in the
	// detail line below, where it can wrap instead of being cut off.
	const statusTitle = (() => {
		switch (status) {
			case "measuring":
			case "running":
				return t("profile_details.locating", { defaultValue: "Locating…" });
			case "done":
				return t("profile_details.location_finder_result_title", { defaultValue: "Location found" });
			case "cancelled":
			case "error":
				return t("profile_details.location_finder_status_cancelled", { defaultValue: "Stopped" });
		}
	})();

	const statusDetail = (() => {
		switch (status) {
			case "measuring":
				return t("profile_details.location_finder_status_measuring", {
					defaultValue: "Measuring initial distance…",
				});
			case "running":
				return t("profile_details.location_finder_status_round", {
					round: round + 1,
					rounds: totalRounds,
					point: Math.min(step + 1, POINTS_PER_ROUND),
					defaultValue: "Round {{round}} of {{rounds}} · point {{point}} of 3",
				});
			case "error":
				return progress.errorMessage ?? t("profile_details.location_finder_error_general");
			case "done":
				// e.g. the note that an age-verification region capped the accuracy
				return progress.errorMessage;
			default:
				return null;
		}
	})();

	const formatMeters = (meters: number) => formatDistanceForUnits(meters, unitsPreset, t);
	const initialDistanceText =
		progress.initialDistance !== null ? formatMeters(progress.initialDistance) : null;
	const errorText = hasEstimate && errorMeters !== null ? formatMeters(errorMeters) : null;
	const initialDistanceLabel = t("profile_details.location_finder_label_initial_distance", {
		defaultValue: "Initial distance",
	});
	const errorLabel = t("profile_details.location_finder_label_accuracy", { defaultValue: "Accuracy" });
	// Accuracy once there's an estimate, the starting distance before that.
	const metric = errorText
		? { value: `±${errorText}`, label: errorLabel }
		: initialDistanceText
			? { value: initialDistanceText, label: initialDistanceLabel }
			: null;
	const restoringText = isRestoring
		? t("profile_details.location_finder_restoring", { defaultValue: "Restoring your location…" })
		: null;
	// Running: "Locating… 83%" over the round info. Otherwise the sheet's own
	// title comes back and the outcome ("Location found", "Stopped") is the
	// subtitle, followed by any reason or note.
	const subtitleLines = [
		// "Location found · Restoring your location…" on one line
		isRunning ? null : [statusTitle, restoringText].filter(Boolean).join(" · "),
		statusDetail,
	].filter((line): line is string => Boolean(line));

	const handleOpenMaps = () => {
		const url = isDesktop
			? `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`
			: isIos()
			? `https://maps.apple.com/?ll=${lat},${lon}&q=${lat},${lon}`
			: `geo:${lat},${lon}?q=${lat},${lon}`;
		openUrl(url).catch((error) => {
			appLog.error("Failed to open map URL", error);
			window.open(url, "_blank");
		});
	};

	const handleCopy = async () => {
		try {
			await navigator.clipboard.writeText(coords);
			toast.success(t("profile_details.location_finder_location_copied"));
		} catch (error) {
			appLog.error("Failed to copy location to clipboard", error);
		}
	};

	return (
		<BottomSheet
			onClose={onClose}
			isDesktop={isDesktop}
			zIndex="z-[90]"
			bg={NATIVE_SHEET_BG}
			{...mapSheetProps(isDesktop)}
		>
			{/* Status lives in the header (the map stays clear); the number that
			    matters goes in the pin pill on the map. */}
			<div className="mb-3 shrink-0">
				<div className="flex items-start justify-between gap-3">
					<div className="min-w-0 flex-1">
						{/* Plain subtitle lines like the other map sheets' headers. */}
						<h3 className="flex items-baseline gap-2 text-sm font-semibold text-[var(--text)]">
							<span className="truncate">
								{isRunning
									? statusTitle
									: t("profile_details.location_finder", { defaultValue: "Location finder" })}
							</span>
							{isRunning ? (
								<span className="shrink-0 text-xs font-medium tabular-nums text-[var(--text-muted)]">{percent}%</span>
							) : null}
						</h3>
						{subtitleLines.map((line, index) => (
							<p
								key={index}
								className={`mt-0.5 text-xs leading-relaxed ${
									status === "error" && line === statusDetail ? "text-red-400" : "text-[var(--text-muted)]"
								}`}
							>
								{line}
							</p>
						))}
					</div>
					<SheetCloseButton />
				</div>
				{isRunning ? (
					<div className="mt-2.5 h-1 overflow-hidden rounded-full bg-[var(--text)]/10">
						<div
							className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-500"
							style={{ width: `${percent}%` }}
						/>
					</div>
				) : null}
			</div>

			<MapSheetLayout
				map={
					<MapLocationPreview
						lat={lat}
						lon={lon}
						zoom={16}
						interactive
						radiusMeters={
							hasEstimate
								? (errorMeters ?? undefined)
								: (progress.initialDistance ?? undefined)
						}
						className="h-full w-full"
					/>
				}
				pinLabel={
					metric ? (
						<span className="inline-flex items-center gap-2">
							<span className="font-semibold tabular-nums">{metric.value}</span>
							<span className="h-3 w-px shrink-0 bg-white/30" />
							<span className={hasEstimate ? "font-mono text-[11px] text-white/75" : "text-white/75"}>
								{hasEstimate ? coords : metric.label}
							</span>
						</span>
					) : undefined
				}
				footer={
					// While running there's only Stop; copy and Maps come once it's over.
					isRunning ? (
						<button type="button" onClick={onCancel} className={sheetButtonClass("secondary")}>
							<span className="truncate">{t("profile_details.location_finder_stop", { defaultValue: "Stop" })}</span>
						</button>
					) : (
						<>
							{hasEstimate ? (
								<button
									type="button"
									onClick={() => void handleCopy()}
									className={MAP_SHEET_ICON_BUTTON_CLASS}
									aria-label={t("profile_details.location_finder_copy", { defaultValue: "Copy coordinates" })}
								>
									<Copy className="h-4 w-4" />
								</button>
							) : null}
							<button
								type="button"
								onClick={handleOpenMaps}
								disabled={!hasEstimate}
								className={sheetButtonClass()}
							>
								<Navigation className="h-4 w-4" />
								<span className="truncate">{t("profile_details.location_finder_open_maps", { defaultValue: "Open in Maps" })}</span>
							</button>
						</>
					)
				}
			/>
		</BottomSheet>
	);
}
