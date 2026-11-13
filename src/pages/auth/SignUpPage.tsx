import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Mail, Lock, Cake, Eye, EyeOff, LogIn, ShieldAlert, Smartphone, Ticket } from "lucide-react";
import { AuthShell } from "../../components/ui/auth-shell";
import { BugReportButton } from "../../components/ui/BugReportButton";
import { useAuth } from "../../contexts/useAuth";
import { useApi } from "../../hooks/useApi";
import { isRecaptchaAvailable } from "../../services/recaptcha";
import { SmsVerificationRequiredError, type SignInRefusal } from "../../contexts/auth-context";
import { AuthAltAction, AuthCancelAction, AuthSubmitSection, IconInput } from "./auth-form";
import { useAddProfileMode } from "./useAddProfileMode";
import { SmsVerificationPanel } from "./SmsVerificationPanel";
import { ServerFooterButton, ServerSelectSheet } from "./ServerSelectSheet";
import { useServerInfo } from "../../services/serverConfig";
import { useDesktopBreakpoint } from "../../hooks/useDesktopBreakpoint";

const MIN_AGE = 18;
// Earliest date of birth the Free Grind server accepts; anything before is a typo.
const MIN_BIRTHDAY = "1900-01-01";

/** Latest birthday (YYYY-MM-DD) that is MIN_AGE today, for the date input's max. */
function latestAllowedBirthday(): string {
	const now = new Date();
	const d = new Date(Date.UTC(now.getFullYear() - MIN_AGE, now.getMonth(), now.getDate()));
	return d.toISOString().slice(0, 10);
}

/** A date input's YYYY-MM-DD as Unix milliseconds at UTC midnight. */
function birthdayToMillis(value: string): number | null {
	const [y, m, d] = value.split("-").map(Number);
	if (!y || !m || !d) return null;
	return Date.UTC(y, m - 1, d);
}

export function SignUpPage() {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const { signUp, login, error, clearError } = useAuth();
	useEffect(() => clearError, [clearError]);
	const { addProfileMode, cancel: cancelAddProfile, goTo } = useAddProfileMode();
	const { callMethod } = useApi();
	// Accounts this app created so far; null until loaded.
	const [quota, setQuota] = useState<{ used: number; limit: number } | null>(null);
	const server = useServerInfo();
	const isCustom = server.kind === "freeGrind";
	// The local limit only applies to accounts on the official servers.
	const isLimitReached = !isCustom && quota !== null && quota.used >= quota.limit;

	const refreshQuota = useCallback(() => {
		void callMethod("sign_up_quota")
			.then(setQuota)
			.catch(() => setQuota(null));
	}, [callMethod]);
	useEffect(refreshQuota, [refreshQuota]);

	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [showPassword, setShowPassword] = useState(false);
	const [birthday, setBirthday] = useState("");
	// `?invite=` prefills the code (e.g. from a shared invite).
	const [searchParams] = useSearchParams();
	const [inviteCode, setInviteCode] = useState(() => searchParams.get("invite") ?? "");
	// Free Grind servers: "invite" requires a code, "closed" takes no sign-ups.
	// The official servers are always "open" and never see the field.
	const [registrationMode, setRegistrationMode] = useState<"open" | "invite" | "closed">("open");
	useEffect(() => {
		if (!isCustom) {
			setRegistrationMode("open");
			return;
		}
		let cancelled = false;
		void callMethod("registration_mode")
			.then((mode) => {
				if (!cancelled) setRegistrationMode(mode);
			})
			// Unknown: keep the optional field; the server still decides.
			.catch(() => undefined);
		return () => {
			cancelled = true;
		};
	}, [callMethod, isCustom]);
	const inviteRequired = registrationMode === "invite";
	const [isLoading, setIsLoading] = useState(false);
	// Set when the sign-in after creating the account asks for SMS verification.
	const [verification, setVerification] = useState<{ profileId: string; signIn: SignInRefusal } | null>(null);
	// Sign-up on the official servers sends a reCAPTCHA token, which only
	// Android can mint; a self-hosted server needs none.
	const [recaptchaAvailable] = useState(isRecaptchaAvailable);
	const hasRecaptcha = isCustom || recaptchaAvailable;
	const [showServer, setShowServer] = useState(false);
	const isDesktop = useDesktopBreakpoint();
	const footer = (
		<div className="flex flex-wrap items-center justify-center gap-1">
			<ServerFooterButton onClick={() => setShowServer(true)} />
			{addProfileMode ? null : <BugReportButton />}
		</div>
	);
	const serverSheet = showServer ? (
		<ServerSelectSheet isDesktop={isDesktop} onClose={() => setShowServer(false)} addProfile={addProfileMode} />
	) : null;
	const title = addProfileMode ? t("auth.sign_in.add_profile_title", { defaultValue: "Add Profile" }) : t("auth.sign_up.title");
	const subtitle = addProfileMode
		? t("auth.sign_up.add_profile_subtitle", { defaultValue: "Create a new account to add it to this app." })
		: t("auth.sign_up.subtitle", { defaultValue: "Create a new Grindr account with your email and password." });
	const cancelAction = addProfileMode ? <AuthCancelAction onClick={() => void cancelAddProfile()} /> : null;

	const maxBirthday = latestAllowedBirthday();
	const birthdayMillis = birthdayToMillis(birthday);
	const isTooYoung = birthday !== "" && birthday > maxBirthday;
	const isTooOld = birthday !== "" && birthday < MIN_BIRTHDAY;
	const isFormValid =
		email.trim().length > 0 &&
		password.length > 0 &&
		birthdayMillis !== null &&
		!isTooYoung &&
		!isTooOld &&
		(!inviteRequired || inviteCode.trim().length > 0);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!isFormValid || birthdayMillis === null) return;
		setIsLoading(true);
		try {
			await signUp({
				email: email.trim(),
				password,
				birthday: birthdayMillis,
				inviteCode: isCustom ? inviteCode.trim() || undefined : undefined,
			});
			navigate("/");
		} catch (error) {
			// AuthContext updates `error`, which is rendered in the form.
			if (error instanceof SmsVerificationRequiredError) {
				setVerification({ profileId: error.profileId, signIn: error.signIn });
			}
		} finally {
			setIsLoading(false);
			refreshQuota();
		}
	};

	if (verification) {
		return (
			<SmsVerificationPanel
				profileId={verification.profileId}
				signIn={verification.signIn}
				onVerified={async () => {
					await login(email.trim(), password, { keepDevice: true });
					navigate("/");
				}}
				onCancel={() => setVerification(null)}
			/>
		);
	}

	// Elsewhere than on Android the form could never submit.
	if (!hasRecaptcha) {
		return (
			<AuthShell title={title} subtitle={subtitle} footer={footer}>
				{serverSheet}
				<div className="animate-fade-in flex items-start gap-3 native-card rounded-2xl px-3 py-3">
					<span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)]">
						<Smartphone className="h-4 w-4" />
					</span>
					<div className="min-w-0 space-y-1 text-sm">
						<p className="font-semibold text-[var(--text)]">
							{t("auth.sign_up.android_only_title", { defaultValue: "Only available on Android" })}
						</p>
						<p className="leading-relaxed text-[var(--text-muted)]">
							{t("auth.sign_up.android_only_desc", {
								defaultValue: "Creating an account needs captcha verification, which is only available on Android.",
							})}
						</p>
					</div>
				</div>
				<AuthAltAction onClick={() => goTo("/auth/sign-in")} label={t("auth.sign_up.back", { defaultValue: "Back" })} />
				{cancelAction}
			</AuthShell>
		);
	}

	return (
		<AuthShell title={title} subtitle={subtitle} footer={footer}>
			{serverSheet}
			{registrationMode === "closed" ? (
				<div className="animate-fade-in flex items-start gap-2.5 rounded-2xl bg-red-500/12 px-3 py-3 text-sm text-[var(--text)]">
					<ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-[#f87171]" />
					<div className="space-y-1">
						<p className="font-semibold">
							{t("auth.sign_up.closed_title", { defaultValue: "Registration closed" })}
						</p>
						<p className="leading-relaxed text-[var(--text-muted)]">
							{t("auth.sign_up.closed_desc", { defaultValue: "This server isn't accepting new accounts right now." })}
						</p>
					</div>
				</div>
			) : isLimitReached ? (
				<div className="animate-fade-in flex items-start gap-2.5 rounded-2xl bg-red-500/12 px-3 py-3 text-sm text-[var(--text)]">
					<ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-[#f87171]" />
					<div className="space-y-1">
						<p className="font-semibold">
							{t("auth.sign_up.limit_reached_title", { defaultValue: "Account limit reached" })}
						</p>
						<p className="leading-relaxed text-[var(--text-muted)]">
							{t("auth.sign_up.limit_reached_desc", {
								defaultValue:
									"This app has already created {{limit}} accounts. To prevent abuse, no further accounts can be created.",
								limit: quota.limit,
							})}
						</p>
					</div>
				</div>
			) : (
				<form onSubmit={handleSubmit} className="animate-fade-in space-y-3">
					<IconInput
						icon={<Mail className="h-4 w-4" />}
						type="email"
						value={email}
						onChange={(e) => setEmail(e.target.value)}
						required
						autoFocus
						autoComplete="email"
						placeholder={t("auth.common.email")}
					/>
					<IconInput
						icon={<Lock className="h-4 w-4" />}
						type={showPassword ? "text" : "password"}
						value={password}
						onChange={(e) => setPassword(e.target.value)}
						required
						autoComplete="new-password"
						placeholder={t("auth.common.password")}
						rightSlot={
							<button
								type="button"
								onClick={() => setShowPassword((prev) => !prev)}
								className="flex items-center p-0 text-[var(--text-muted)] hover:text-[var(--text)]"
								tabIndex={-1}
								aria-label={showPassword ? t("auth.common.hide_password") : t("auth.common.show_password")}
							>
								{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
							</button>
						}
					/>
					<div className="space-y-1.5">
						<label htmlFor="sign-up-birthday" className="block text-xs font-medium text-[var(--text-muted)]">
							{t("auth.sign_up.birthday_label", { defaultValue: "Date of birth" })}
						</label>
						<IconInput
							id="sign-up-birthday"
							icon={<Cake className="h-4 w-4" />}
							type="date"
							value={birthday}
							onChange={(e) => setBirthday(e.target.value)}
							required
							min={MIN_BIRTHDAY}
							max={maxBirthday}
							autoComplete="bday"
						/>
						{isTooYoung ? (
							<p className="text-xs text-[#f87171]">{t("auth.sign_up.too_young", { age: MIN_AGE, defaultValue: "You must be at least {{age}} years old." })}</p>
						) : isTooOld ? (
							<p className="text-xs text-[#f87171]">{t("auth.sign_up.invalid_birthday", { defaultValue: "Please enter a valid date of birth." })}</p>
						) : null}
					</div>
					{isCustom ? (
						<div className="space-y-1.5">
							<label htmlFor="sign-up-invite" className="block text-xs font-medium text-[var(--text-muted)]">
								{inviteRequired
									? t("auth.sign_up.invite_label_required", { defaultValue: "Invite code" })
									: t("auth.sign_up.invite_label_optional", { defaultValue: "Invite code (optional)" })}
							</label>
							<IconInput
								id="sign-up-invite"
								icon={<Ticket className="h-4 w-4" />}
								value={inviteCode}
								onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
								required={inviteRequired}
								autoComplete="off"
								autoCapitalize="characters"
								spellCheck={false}
								maxLength={40}
								placeholder="XXXXX-XXXXX"
							/>
							{inviteRequired ? (
								<p className="text-xs text-[var(--text-muted)]">
									{t("auth.sign_up.invite_hint", { defaultValue: "This server only accepts new accounts with an invite from an existing member." })}
								</p>
							) : null}
						</div>
					) : null}
					<AuthSubmitSection
						error={error}
						loading={isLoading}
						disabled={!isFormValid}
						loadingLabel={t("auth.sign_up.creating", { defaultValue: "Creating account..." })}
						label={t("auth.sign_up.submit", { defaultValue: "Create account" })}
					/>
				</form>
			)}
			<AuthAltAction
				onClick={() => goTo("/auth/sign-in")}
				icon={<LogIn className="h-4 w-4" />}
				label={t("auth.sign_up.have_account_action")}
			/>
			{cancelAction}
		</AuthShell>
	);
}
