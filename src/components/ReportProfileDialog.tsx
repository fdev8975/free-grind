import { Check, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { useApiFunctions } from "../hooks/useApiFunctions";
import {
	buildProfileReport,
	REPORT_LOCATIONS,
	RIGHT_NOW_REPORT_LOCATIONS,
	REPORT_REASONS,
	type ReportLocation,
	type ReportReason,
} from "../types/reports";
import { useDesktopBreakpoint } from "../hooks/useDesktopBreakpoint";
import { cn } from "../utils/cn";
import { NATIVE_SHEET_BG } from "./ui/action-sheet";
import { SheetClose, SheetCloseButton, SHEET_FOOTER_CLASS, sheetButtonClass } from "./ui/bottom-sheet";
import { ControlledBottomSheet } from "./ui/controlled-sheet";
import { SHEET_FIELD_CLASS, SheetChip, SheetSection } from "./ui/sheet-section";

type ReportProfileDialogProps = {
	isOpen: boolean;
	/** The reported profile; null for a discreet Right Now post, whose author is unknown. */
	profileId: string | null;
	/**
	 * Reports this Right Now post instead of the profile as a whole: with a
	 * known author as a profile report carrying `rightNowInfo`, otherwise via
	 * POST /v1/flags/right-now/{postId}.
	 */
	rightNowPostId?: number | null;
	onClose: () => void;
	/** Offered after a successful report; omitted hides the "Block" button. */
	onBlock?: () => void;
};

export function ReportProfileDialog({ isOpen, profileId, rightNowPostId = null, onClose, onBlock }: ReportProfileDialogProps) {
	const { t } = useTranslation();
	const apiFunctions = useApiFunctions();
	const isDesktop = useDesktopBreakpoint();
	const [reason, setReason] = useState<ReportReason | null>(null);
	const [locations, setLocations] = useState<ReportLocation[]>([]);
	const [comment, setComment] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [isSubmitted, setIsSubmitted] = useState(false);
	/** A discreet post we reported before (GET /v1/flags/right-now/{postId}). */
	const [isAlreadyReported, setIsAlreadyReported] = useState(false);
	const isRightNowPost = rightNowPostId != null;
	const locationOptions: readonly ReportLocation[] = isRightNowPost ? RIGHT_NOW_REPORT_LOCATIONS : REPORT_LOCATIONS;

	useEffect(() => {
		if (!isOpen) return;
		setReason(null);
		// A post report is about the post's photo and text unless narrowed down.
		setLocations(isRightNowPost ? [...RIGHT_NOW_REPORT_LOCATIONS] : []);
		setComment("");
		setIsSubmitted(false);
		setIsAlreadyReported(false);
	}, [isOpen, isRightNowPost]);

	// Only discreet posts have a report of their own to look up; a known
	// author's post report is a profile report.
	useEffect(() => {
		if (!isOpen || rightNowPostId == null || profileId != null) return;
		let cancelled = false;
		apiFunctions
			.getRightNowPostReport(rightNowPostId)
			.then((report) => {
				if (!cancelled && report) setIsAlreadyReported(true);
			})
			.catch(() => {
				// Not knowing about an earlier report just leaves the form open.
			});
		return () => {
			cancelled = true;
		};
	}, [isOpen, rightNowPostId, profileId, apiFunctions]);

	const showDetails = reason !== null && reason !== "SPAM";

	const toggleLocation = (location: ReportLocation) => {
		setLocations((current) =>
			current.includes(location) ? current.filter((l) => l !== location) : [...current, location],
		);
	};

	const handleSubmit = async () => {
		if (reason === null || isSubmitting) return;
		setIsSubmitting(true);
		try {
			// Nothing narrowed down on a post: it's about the post as a whole.
			const reportLocations = isRightNowPost && locations.length === 0 ? [...RIGHT_NOW_REPORT_LOCATIONS] : locations;
			const report = buildProfileReport(reason, comment, reportLocations);
			if (rightNowPostId != null && profileId == null) {
				await apiFunctions.reportRightNowPost(rightNowPostId, report);
			} else if (profileId != null) {
				await apiFunctions.reportProfile(
					profileId,
					rightNowPostId != null ? { ...report, rightNowInfo: { postId: rightNowPostId } } : report,
				);
			} else {
				return;
			}
			setIsSubmitted(true);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : t("profile_details.report.failed"));
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<ControlledBottomSheet
			isOpen={isOpen}
			onDismiss={onClose}
			expandable={!isSubmitted && !isAlreadyReported}
			isDesktop={isDesktop}
			isProcessing={isSubmitting}
			bg={NATIVE_SHEET_BG}
			panelClassName={isDesktop ? "max-h-[82dvh] px-4" : "px-4"}
		>
			{isSubmitted || isAlreadyReported ? (
				<>
					<div className="-mx-4 min-h-0 flex-1 overflow-y-auto px-4 pb-2" data-lenis-prevent>
						<div className="flex flex-col items-center px-2 pt-2 text-center">
							<span className="flex h-14 w-14 items-center justify-center rounded-full accent-tint-15 text-[var(--accent)]">
								<Check className="h-7 w-7" strokeWidth={2.5} />
							</span>
							<h3 className="mt-4 text-base font-semibold text-[var(--text)]">
								{isSubmitted ? t("profile_details.report.submitted_title") : t("profile_details.report.already_reported_title")}
							</h3>
							<p className="mt-2 text-sm leading-relaxed text-[var(--text)]">
								{isRightNowPost ? t("profile_details.report.post_submitted_message") : t("profile_details.report.submitted_message")}
							</p>
							{onBlock && (
								<p className="mt-1 text-sm leading-relaxed text-[var(--text-muted)]">{t("profile_details.report.block_hint")}</p>
							)}
						</div>
					</div>
					<div className={SHEET_FOOTER_CLASS}>
						{onBlock && (
							<SheetClose onClick={onBlock} className={sheetButtonClass("destructive")}>
								{t("profile_details.block")}
							</SheetClose>
						)}
						<SheetClose className={sheetButtonClass()}>
							{t("profile_details.report.done")}
						</SheetClose>
					</div>
				</>
			) : (
				<>
					<div className="mb-3 flex shrink-0 items-center justify-between gap-3">
						<h3 className="text-sm font-semibold text-[var(--text)]">
							{isRightNowPost ? t("profile_details.report.post_title") : t("profile_details.report.title")}
						</h3>
						<SheetCloseButton disabled={isSubmitting} />
					</div>
					<div className="-mx-4 min-h-0 flex-1 overflow-y-auto px-4 pb-2" data-lenis-prevent>
						<p className="mb-4 px-1 text-sm leading-relaxed text-[var(--text-muted)]">{isRightNowPost ? t("profile_details.report.post_message") : t("profile_details.report.message")}</p>
						<div className="space-y-5">
							<SheetSection title={t("profile_details.report.reason_label")}>
								<div className="flex flex-wrap gap-2">
									{REPORT_REASONS.map((value) => (
										<SheetChip
											key={value}
											active={reason === value}
											onClick={() => !isSubmitting && setReason(reason === value ? null : value)}
										>
											{t(`profile_details.report.reasons.${value}`)}
										</SheetChip>
									))}
								</div>
							</SheetSection>

							{showDetails && (
								<>
									<SheetSection title={t("profile_details.report.location_label")}>
										<div className="flex flex-wrap gap-2">
											{locationOptions.map((value) => (
												<SheetChip
													key={value}
													active={locations.includes(value)}
													onClick={() => !isSubmitting && toggleLocation(value)}
												>
													{t(`profile_details.report.locations.${value}`)}
												</SheetChip>
											))}
										</div>
									</SheetSection>
									<textarea
										value={comment}
										onChange={(event) => setComment(event.target.value)}
										placeholder={t("profile_details.report.details_placeholder")}
										disabled={isSubmitting}
										rows={3}
										className={cn(SHEET_FIELD_CLASS, "resize-none px-4 py-3 disabled:opacity-60")}
									/>
								</>
							)}
						</div>
					</div>
					<div className={SHEET_FOOTER_CLASS}>
						<SheetClose disabled={isSubmitting} className={sheetButtonClass("secondary")}>
							{t("chat.actions.cancel")}
						</SheetClose>
						<button
							type="button"
							onClick={() => void handleSubmit()}
							disabled={isSubmitting || reason === null}
							className={sheetButtonClass()}
						>
							{isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
							<span className="truncate">{t("profile_details.report.submit")}</span>
						</button>
					</div>
				</>
			)}
		</ControlledBottomSheet>
	);
}
