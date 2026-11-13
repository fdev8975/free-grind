import { useState, type ComponentType, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { Ban, Cable, ChevronRight, Clock, Download, Globe, KeyRound, Pointer, Radar, RefreshCcw, RotateCcw, ScrollText, Share2, Terminal } from "lucide-react";
import {
	ArchiveRestoreFilled,
	BellFilled,
	BugFilled,
	EyeFilled,
	FileUpFilled,
	FlaskConicalFilled,
	GhostFilled,
	HeartPulseFilled,
	ImagesFilled,
	MegaphoneFilled,
	ShieldCheckFilled,
	ShieldFilled,
	TriangleAlertFilled,
} from "../../components/icons/FilledIcons";
import { PageHeader } from "../../components/PageHeader";
import { ToggleRow } from "../../components/ui/toggle-row";
import { FullscreenPortal } from "../../components/FullscreenPrompt";
import { VersionAnnouncement } from "../../components/VersionAnnouncement";
import { OutdatedVersionPromptView } from "../../components/OutdatedVersionPrompt";
import { AccountStatusPromptView } from "../../components/AccountStatusPrompt";
import { TestReminderPromptView } from "../../components/TestReminderPrompt";
import { TokenExpiredPromptView } from "../../components/TokenExpiredPrompt";
import { useFingerprintCheck } from "../../components/FingerprintCheckButton";
import { RELEASES_URL } from "../../config/links-config";
import { usePreferences } from "../../contexts/PreferencesContext";
import { useAuth } from "../../contexts/useAuth";
import type { AccountStatus } from "../../contexts/auth-context";
import { VERSION_ANNOUNCEMENTS } from "../../data/versionAnnouncements";
import { getCurrentHotswapChannel, showHotswapUpdatePrompt } from "../../services/hotswap";
import { setChatArchiveEnabled, useChatArchiveEnabled } from "../../services/chatArchiveMode";
import {
	isScreenCaptureProtectionSupported,
	setScreenCaptureProtectionEnabled,
	useScreenCaptureProtectionEnabled,
} from "../../services/screenCaptureProtection";
import { isAndroid, isIos } from "../../services/saveMedia";
import { hasDemoProfileImages, isDemoProfileImagesEnabled, setDemoProfileImagesEnabled } from "../../utils/demoProfileImages";
import { saveIssueLogsFile } from "../../utils/issueTelemetry";
import { replayOnboarding } from "../../utils/onboardingStorage";
import { replayRestoreOffer } from "../../utils/restoreOfferStorage";
import { showLegalAgreementsPrompt } from "../../utils/legalAgreementsDebug";
import { showAccountWarningsPrompt } from "../../utils/accountWarningsDebug";
import { showSharePickerDebug } from "../../utils/sharePickerDebug";
import { showLgbtqRiskCountryWarning } from "../../utils/lgbtqRiskCountryDebug";
import { resetGridGesturesIntro } from "./gridpage/components/GridGesturesIntro";
import { resetInterestOnboarding } from "./interest/InterestOnboardingModal";
import { FingerprintCheckSheet } from "./settings-dev/DiagnosticsSheets";
import { SeasonalOverlaysSheet } from "./settings-dev/SeasonalOverlaysSheet";

// Always previews whichever entry was added/edited most recently, regardless
// of whether it matches the app's current running version yet.
const LATEST_ANNOUNCEMENT = VERSION_ANNOUNCEMENTS[VERSION_ANNOUNCEMENTS.length - 1] ?? null;

const PREVIEW_RELEASE_INFO = {
	latestVersion: "9.9.9",
	releasesUrl: RELEASES_URL,
	commit: "development",
	releases: [
		{ version: "9.9.9", publishedAt: new Date(Date.now() - 2 * 86_400_000).toISOString() },
		{ version: "9.9.8", publishedAt: new Date(Date.now() - 12 * 86_400_000).toISOString() },
		{ version: import.meta.env.VITE_APP_VERSION, publishedAt: new Date(Date.now() - 30 * 86_400_000).toISOString() },
	],
};
const PREVIEW_BAN_STATUS: AccountStatus = {
	kind: "banned",
	info: { kind: "profile", code: 27, message: "Profile is banned", subReason: "DRUG_SALES", automated: true },
	profileId: null,
};
const PREVIEW_DEVICE_BAN_STATUS: AccountStatus = {
	kind: "banned",
	info: { kind: "device", code: 28, message: "Account banned" },
	profileId: null,
};
const PREVIEW_NETWORK_BAN_STATUS: AccountStatus = {
	kind: "banned",
	info: { kind: "network", code: 31, message: "Suspicious network" },
	profileId: null,
};
const PREVIEW_UNDERAGE_BAN_STATUS: AccountStatus = {
	kind: "banned",
	info: { kind: "underage", code: 35, message: "Underage", subReason: "UNDERAGE_ACCESS", automated: false },
	profileId: null,
};
// Built on selection so the expiry is relative to now: still running, or
// already over with the ban agreement waiting to be accepted.
function previewTimedBanStatus(expired: boolean): AccountStatus {
	return {
		kind: "restriction",
		restriction: {
			kind: "timedBan",
			// BOT_ACTIVITY is one of the timed bans that offer an appeal.
			reason: expired ? null : "HARASSMENT",
			subReason: expired ? "BOT_ACTIVITY" : "MILD_INSULTS",
			automated: true,
			expiresAt: Math.floor(Date.now() / 1000) + (expired ? -60 * 60 : 2 * 24 * 60 * 60),
			agreementCompleted: expired ? false : null,
		},
	};
}

const DEV_ICON_CLASS = "bg-slate-500/15 text-slate-400";

type DevRowProps = {
	icon: ComponentType<{ className?: string }>;
	label: string;
	description: string;
	onClick: () => void;
	disabled?: boolean;
};

function DevRow({ icon: Icon, label, description, onClick, disabled }: DevRowProps) {
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			className="flex w-full items-center gap-3 px-4 py-3.5 text-start transition-colors hover-fill disabled:cursor-not-allowed disabled:opacity-50"
		>
			<div className={`rounded-2xl p-2.5 shrink-0 ${DEV_ICON_CLASS}`}>
				<Icon className="h-5 w-5" />
			</div>
			<div className="min-w-0 flex-1">
				<p className="text-sm font-semibold leading-snug">{label}</p>
				<p className="text-xs text-[var(--text-muted)] leading-snug mt-0.5">{description}</p>
			</div>
			<ChevronRight className="h-4 w-4 shrink-0 text-[var(--text-muted)] opacity-50" />
		</button>
	);
}

function Section({ title, children }: { title: string; children: ReactNode }) {
	return (
		<div>
			<p className="mb-2 px-1 text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">{title}</p>
			<div className="native-group">{children}</div>
		</div>
	);
}

/** Developer-mode tools: debug toggles, inspectors, diagnostics and UI previews. */
export function DeveloperPage() {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const { userId } = useAuth();
	const { showDebugInfo, setPreferences } = usePreferences();
	const isChatArchiveEnabled = useChatArchiveEnabled();
	const isScreenCaptureProtected = useScreenCaptureProtectionEnabled();
	const fingerprintCheck = useFingerprintCheck();
	const frontendVersion = import.meta.env.VITE_APP_VERSION;

	const [isFingerprintSheetOpen, setIsFingerprintSheetOpen] = useState(false);
	const [isSeasonalSheetOpen, setIsSeasonalSheetOpen] = useState(false);
	const [previewAnnouncement, setPreviewAnnouncement] = useState(false);
	const [previewOutdatedPrompt, setPreviewOutdatedPrompt] = useState(false);
	const [previewAccountStatus, setPreviewAccountStatus] = useState<AccountStatus>(null);
	const [previewTestReminder, setPreviewTestReminder] = useState(false);
	const [previewTokenExpired, setPreviewTokenExpired] = useState(false);

	const handleExportLogs = async () => {
		try {
			const fileName = await saveIssueLogsFile();
			toast.success(
				isAndroid() || !isIos()
					? `Saved to Downloads/FreeGrind/${fileName}`
					: `Saved to Files → On My iPhone/iPad → Free Grind/${fileName}`,
			);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Export failed");
		}
	};

	if (previewAnnouncement && LATEST_ANNOUNCEMENT) {
		return (
			<FullscreenPortal className="z-[300]">
				<VersionAnnouncement
					announcement={LATEST_ANNOUNCEMENT}
					buttonLabel={t("common.close", { defaultValue: "Close" })}
					onClose={() => setPreviewAnnouncement(false)}
				/>
			</FullscreenPortal>
		);
	}

	if (previewAccountStatus) {
		return (
			<FullscreenPortal className="z-[110]">
				<AccountStatusPromptView
					status={previewAccountStatus}
					backupProfileId={userId}
					onSignOut={() => setPreviewAccountStatus(null)}
					onAcceptBanAgreement={async () => setPreviewAccountStatus(null)}
				/>
			</FullscreenPortal>
		);
	}

	if (previewTokenExpired) {
		return (
			<FullscreenPortal className="z-[110]">
				<TokenExpiredPromptView onSignOut={() => setPreviewTokenExpired(false)} />
			</FullscreenPortal>
		);
	}

	if (previewTestReminder) {
		return (
			<FullscreenPortal className="z-[110]">
				<TestReminderPromptView
					onSave={() => setPreviewTestReminder(false)}
					onSkip={() => setPreviewTestReminder(false)}
				/>
			</FullscreenPortal>
		);
	}

	if (previewOutdatedPrompt) {
		return (
			<FullscreenPortal className="z-[110]">
				<OutdatedVersionPromptView
					appVersion={frontendVersion}
					releaseInfo={PREVIEW_RELEASE_INFO}
					onDismiss={() => setPreviewOutdatedPrompt(false)}
				/>
			</FullscreenPortal>
		);
	}

	return (
		<section className="app-screen">
			<PageHeader
				backTo="/settings"
				title="Developer"
				subtitle="Debug toggles, inspectors, diagnostics and previews of one-off screens."
			/>

			<div className="grid gap-6">
				<Section title="Display">
					<ToggleRow
						checked={showDebugInfo}
						onChange={(checked) => void setPreferences({ showDebugInfo: checked })}
						icon={<BugFilled className="h-5 w-5" />}
						iconClass={DEV_ICON_CLASS}
						label="Show Debug Overlays"
						description="Displays source (cache/network) info in the grid."
					/>
					<DevRow
						icon={GhostFilled}
						label="Seasonal Overlays"
						description="Force seasonal themes on outside their dates, or turn them off."
						onClick={() => setIsSeasonalSheetOpen(true)}
					/>
					{hasDemoProfileImages() && (
						<ToggleRow
							checked={isDemoProfileImagesEnabled()}
							onChange={setDemoProfileImagesEnabled}
							icon={<ImagesFilled className="h-5 w-5" />}
							iconClass={DEV_ICON_CLASS}
							label="Demo Profile Pictures"
							description="Replaces every profile photo with a bundled demo picture, for screenshots. Reloads the app."
						/>
					)}
					{isScreenCaptureProtectionSupported() && (
						<ToggleRow
							checked={isScreenCaptureProtected}
							onChange={setScreenCaptureProtectionEnabled}
							icon={<ShieldCheckFilled className="h-5 w-5" />}
							iconClass={DEV_ICON_CLASS}
							label="Screenshot Protection"
							description={isScreenCaptureProtected
								? "Screenshots, screen recordings and screen sharing show the app blank."
								: "Off: the app can be captured in screenshots, recordings and screen sharing."}
						/>
					)}
				</Section>

				<Section title="Chat">
					<ToggleRow
						checked={isChatArchiveEnabled}
						onChange={setChatArchiveEnabled}
						icon={<ArchiveRestoreFilled className="h-5 w-5" />}
						iconClass={DEV_ICON_CLASS}
						label="Archive Mode"
						description={isChatArchiveEnabled
							? "Expiring photos, videos and albums stay viewable after they expire, and unsent messages keep their content."
							: "Expiring photos, videos and albums expire as sent and use a view only when opened. Unsent messages show as unsent."}
					/>
				</Section>

				<Section title="Inspectors">
					<DevRow
						icon={Terminal}
						label={t("settings.api_inspector")}
						description={t("settings.api_inspector_desc")}
						onClick={() => navigate("/settings/api-inspector")}
					/>
					<DevRow
						icon={Cable}
						label="WebSocket Explorer"
						description="Every realtime frame sent and received, live. Send your own commands too."
						onClick={() => navigate("/settings/ws-explorer")}
					/>
					{isAndroid() && (
						<DevRow
							icon={BellFilled}
							label="Push Inspector (FCM)"
							description="Every push and notification tap with its full payload, plus the device push token."
							onClick={() => navigate("/settings/push-inspector")}
						/>
					)}
					<DevRow
						icon={FlaskConicalFilled}
						label="Assignments & Feature Flags"
						description="Server-side flags and A/B experiments assigned to this account."
						onClick={() => navigate("/settings/assignments")}
					/>
				</Section>

				<Section title="Diagnostics">
					<DevRow
						icon={Radar}
						label="Fingerprint Check"
						description="Verify your HTTP/TLS fingerprint matches OkHttp."
						onClick={() => setIsFingerprintSheetOpen(true)}
					/>
					<DevRow
						icon={ScrollText}
						label="Export Logs"
						description="Saves recent warnings and errors as a JSON file to attach to a bug report."
						onClick={() => void handleExportLogs()}
					/>
				</Section>

				<Section title="Onboarding Previews">
					<DevRow icon={RotateCcw} label="Replay Onboarding" description="The first-launch setup flow." onClick={replayOnboarding} />
					<DevRow
						icon={Pointer}
						label="Grid Gestures Intro"
						description="The one-time tile gestures intro, shown on the grid once profiles load."
						onClick={() => {
							resetGridGesturesIntro();
							navigate("/");
						}}
					/>
					<DevRow
						icon={EyeFilled}
						label="Profile Views Intro"
						description="The one-time intro on the Interest page's Views tab."
						onClick={() => {
							resetInterestOnboarding();
							navigate("/interest?tab=views");
						}}
					/>
					<DevRow icon={FileUpFilled} label="Restore Offer" description="The first-login backup restore dialog." onClick={replayRestoreOffer} />
					<DevRow icon={ScrollText} label="Legal Agreements" description="Terms of Service / Privacy Policy, even if already accepted." onClick={showLegalAgreementsPrompt} />
				</Section>

				<Section title="Account Status Previews">
					<DevRow icon={Ban} label="Ban Screen" description="A permanent profile ban (DRUG_SALES) with its explanation." onClick={() => setPreviewAccountStatus(PREVIEW_BAN_STATUS)} />
					<DevRow icon={Ban} label="Device Ban Screen" description="Code 28, often a refused fingerprint rather than a real ban." onClick={() => setPreviewAccountStatus(PREVIEW_DEVICE_BAN_STATUS)} />
					<DevRow icon={Globe} label="Network Ban Screen" description="Code 31 (SUSPICIOUS_NETWORK), e.g. a VPN." onClick={() => setPreviewAccountStatus(PREVIEW_NETWORK_BAN_STATUS)} />
					<DevRow icon={Ban} label="Underage Ban Screen" description="Code 35, banned as under 18 by a moderator." onClick={() => setPreviewAccountStatus(PREVIEW_UNDERAGE_BAN_STATUS)} />
					<DevRow icon={Clock} label="Timed Ban Screen" description="A temporary ban (MILD_INSULTS) that ends in two days." onClick={() => setPreviewAccountStatus(previewTimedBanStatus(false))} />
					<DevRow icon={ScrollText} label="Ban Agreement Screen" description="An expired temporary ban (BOT_ACTIVITY, appealable) waiting for its ban agreement." onClick={() => setPreviewAccountStatus(previewTimedBanStatus(true))} />
					<DevRow icon={KeyRound} label="Token Expired Screen" description={'The "session expired" prompt asking to sign in again.'} onClick={() => setPreviewTokenExpired(true)} />
					<DevRow icon={TriangleAlertFilled} label="Account Warnings" description="The community-guidelines warnings prompt with sample warnings." onClick={showAccountWarningsPrompt} />
				</Section>

				<Section title="Prompt Previews">
					<DevRow icon={HeartPulseFilled} label="Test Reminder" description="The HIV test check-up reminder; saving here doesn't touch your profile." onClick={() => setPreviewTestReminder(true)} />
					<DevRow icon={ShieldFilled} label="Risk Country Warning" description="The safety warning for a location in a dangerous country (Egypt); not remembered." onClick={showLgbtqRiskCountryWarning} />
					<DevRow icon={Share2} label="Share Picker" description={'The "Send to…" chat picker with sample images.'} onClick={() => void showSharePickerDebug()} />
					<DevRow
						icon={MegaphoneFilled}
						label="Version Announcement"
						description={
							LATEST_ANNOUNCEMENT
								? LATEST_ANNOUNCEMENT.tagline
									? `"${LATEST_ANNOUNCEMENT.tagline}" (v${LATEST_ANNOUNCEMENT.version}).`
									: `v${LATEST_ANNOUNCEMENT.version}.`
								: "No version announcement configured yet."
						}
						disabled={!LATEST_ANNOUNCEMENT}
						onClick={() => setPreviewAnnouncement(true)}
					/>
					<DevRow icon={Download} label="Outdated Update Prompt" description={'The "Update Available" screen for outdated apps.'} onClick={() => setPreviewOutdatedPrompt(true)} />
					<DevRow
						icon={RefreshCcw}
						label="OTA Update Prompt"
						description={'The frontend "Update Available" screen, with a simulated download.'}
						onClick={() =>
							showHotswapUpdatePrompt({
								version: `${frontendVersion}-ota.${getCurrentHotswapChannel()}.${Math.floor(Date.now() / 1000)}`,
								notes: null,
								// Any ref works for the diff link; the default branch always has one.
								commit: "development",
								preview: true,
							})
						}
					/>
				</Section>
			</div>

			{isSeasonalSheetOpen && <SeasonalOverlaysSheet onClose={() => setIsSeasonalSheetOpen(false)} />}

			{isFingerprintSheetOpen && (
				<FingerprintCheckSheet check={fingerprintCheck} onClose={() => setIsFingerprintSheetOpen(false)} />
			)}
		</section>
	);
}
