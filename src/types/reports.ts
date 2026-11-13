export const REPORT_REASONS = [
	"SPAM",
	"HARASSMENT_BULLYING",
	"HATE_DISCRIMINATION",
	"NUDITY_PORNOGRAPHY",
	"UNDERAGE",
	"IMPERSONATION",
	"ILLEGAL_ACTIVITY",
	"SEXUAL_SOLICITATION",
	"SERIOUS_IN_PERSON_INCIDENT",
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_LOCATIONS = [
	"PROFILE_PHOTO",
	"PROFILE_INFORMATION",
	"CHAT_MESSAGE",
	"ALBUM",
	"RIGHT_NOW_PHOTO",
	"RIGHT_NOW_TEXT",
	"STORY",
] as const;
export type ReportLocation = (typeof REPORT_LOCATIONS)[number];

export interface ProfileReportRequest {
	reason: ReportReason;
	comment: string;
	locations: ReportLocation[];
	/** The reported Right Now post, when the report is about one. */
	rightNowInfo?: { postId: number };
}

/** What a Right Now post report can point at. */
export const RIGHT_NOW_REPORT_LOCATIONS = ["RIGHT_NOW_PHOTO", "RIGHT_NOW_TEXT"] as const satisfies readonly ReportLocation[];

/** A report you already filed (GET /v3.1|v4/flags/{profileId}, GET /v1/flags/right-now/{postId}). */
export interface SubmittedReport {
	status: string | null;
	createTime: number | null;
}

/** Spam reports carry no details — the official client always files them against chat. */
export function buildProfileReport(
	reason: ReportReason,
	comment: string,
	locations: ReportLocation[],
): ProfileReportRequest {
	if (reason === "SPAM") return { reason, comment: "", locations: ["CHAT_MESSAGE"] };
	return { reason, comment: comment.trim(), locations };
}
