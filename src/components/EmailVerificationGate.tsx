import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { Hash, MailCheck, X } from "lucide-react";
import { AuthShell } from "./ui/auth-shell";
import { AuthSubmitSection, IconInput } from "../pages/auth/auth-form";
import { useApi } from "../hooks/useApi";
import { useLogoutToNextAccount } from "../hooks/useLogoutToNextAccount";
import { useRefreshAssignments } from "./AssignmentsBridge";
import { useFeatureFlag } from "../services/assignmentsStore";
import { useServerInfo } from "../services/serverConfig";

// Server allows one new code per minute.
const RESEND_COOLDOWN_MS = 60_000;
const CODE_LENGTH = 6;

type Status = { email: string | null; verified: boolean; mode: "off" | "optional" | "required" };

/**
 * E-mail verification on the Free Grind server, which can't send SMS. The
 * server marks unverified sessions with the JWT feature flag `email_unverified`
 * (plus `email_verification_required` when the flag `email_verification` is
 * "required"; the API then refuses everything else). Required → this screen
 * replaces the app; optional → a dismissible banner opens it.
 */
export function EmailVerificationGate({ children }: { children: ReactNode }) {
	const server = useServerInfo();
	const unverified = useFeatureFlag("email_unverified");
	const required = useFeatureFlag("email_verification_required");
	const [open, setOpen] = useState(false);
	const [dismissed, setDismissed] = useState(false);
	const { t } = useTranslation();

	if (server.kind !== "freeGrind" || !unverified) return <>{children}</>;
	if (required || open) {
		return (
			<div className="app-shell">
				<EmailVerificationPanel required={required} onClose={() => setOpen(false)} />
			</div>
		);
	}
	return (
		<>
			{children}
			{!dismissed ? (
				<div className="fixed inset-x-3 z-[60] flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 shadow-lg" style={{ bottom: "calc(var(--safe-area-bottom, 0px) + 84px)" }}>
					<MailCheck className="h-5 w-5 shrink-0 text-[var(--accent)]" />
					<p className="min-w-0 flex-1 text-sm text-[var(--text)]">{t("auth.email_verification.banner", { defaultValue: "Please confirm your e-mail address." })}</p>
					<button type="button" onClick={() => setOpen(true)} className="shrink-0 text-sm font-semibold text-[var(--accent)]">
						{t("auth.email_verification.confirm", { defaultValue: "Confirm" })}
					</button>
					<button type="button" onClick={() => setDismissed(true)} aria-label={t("auth.email_verification.later", { defaultValue: "Later" })} className="shrink-0 text-[var(--text-muted)]">
						<X className="h-4 w-4" />
					</button>
				</div>
			) : null}
		</>
	);
}

function EmailVerificationPanel({ required, onClose }: { required: boolean; onClose: () => void }) {
	const { t } = useTranslation();
	const { callMethod, fetchRest, asAppError } = useApi();
	const refreshAssignments = useRefreshAssignments();
	const logoutToNextAccount = useLogoutToNextAccount();
	const [status, setStatus] = useState<Status | null>(null);
	const [code, setCode] = useState("");
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [resendAt, setResendAt] = useState<number | null>(null);
	const [now, setNow] = useState(Date.now);

	const finish = useCallback(async () => {
		// New token without the e-mail flags, then re-read the claims.
		await callMethod("refresh_token");
		await refreshAssignments();
		toast.success(t("auth.email_verification.done", { defaultValue: "E-mail address confirmed" }));
		onClose();
	}, [callMethod, refreshAssignments, onClose, t]);

	useEffect(() => {
		let cancelled = false;
		void fetchRest("/v1/me/email-verification").then(
			async (res) => {
				if (cancelled || res.status !== 200) return;
				const s = res.json() as Status;
				setStatus(s);
				// Confirmed via the mail link meanwhile.
				if (s.verified) await finish().catch(() => undefined);
			},
			() => undefined,
		);
		return () => {
			cancelled = true;
		};
	}, [fetchRest, finish]);

	useEffect(() => {
		if (resendAt === null) return;
		const timer = window.setInterval(() => {
			const current = Date.now();
			setNow(current);
			if (current >= resendAt) setResendAt(null);
		}, 1000);
		return () => window.clearInterval(timer);
	}, [resendAt]);

	const cooldown = resendAt === null ? 0 : Math.max(0, Math.ceil((resendAt - now) / 1000));
	const failed = (err: unknown) =>
		setError(asAppError(err)?.prettyMessage || t("auth.email_verification.failed", { defaultValue: "Something went wrong. Please try again." }));

	const resend = async () => {
		if (cooldown > 0 || loading) return;
		setLoading(true);
		setError(null);
		try {
			const res = await fetchRest("/v1/me/email-verification/send", { method: "POST", body: {} });
			if (res.status === 429) setError(t("auth.email_verification.too_many", { defaultValue: "Too many requests. Please wait a moment." }));
			else if (res.status >= 400) setError(t("auth.email_verification.send_failed", { defaultValue: "The e-mail couldn't be sent. Please try again later." }));
			else {
				const started = Date.now();
				setNow(started);
				setResendAt(started + RESEND_COOLDOWN_MS);
				toast.success(t("auth.email_verification.sent", { defaultValue: "New code sent" }));
			}
		} catch (err) {
			failed(err);
		} finally {
			setLoading(false);
		}
	};

	const verify = async () => {
		setLoading(true);
		setError(null);
		try {
			const res = await fetchRest("/v1/me/email-verification/verify", { method: "POST", body: { code: code.trim() } });
			if (res.status === 200) {
				await finish();
				return;
			}
			const type = (res.json() as { type?: string } | null)?.type;
			setError(
				type === "urn:gr:err:client_action"
					? t("auth.email_verification.expired", { defaultValue: "This code has expired. Request a new one." })
					: res.status === 429
						? t("auth.email_verification.too_many", { defaultValue: "Too many requests. Please wait a moment." })
						: t("auth.email_verification.wrong_code", { defaultValue: "Wrong code. Check the e-mail and try again." }),
			);
		} catch (err) {
			failed(err);
		} finally {
			setLoading(false);
		}
	};

	return (
		<AuthShell
			title={t("auth.email_verification.title", { defaultValue: "Confirm your e-mail" })}
			subtitle={t("auth.email_verification.hint", {
				defaultValue: "We sent a 6-digit code to {{email}}. Enter it here or open the link in the e-mail.",
				email: status?.email ?? t("auth.email_verification.your_address", { defaultValue: "your address" }),
			})}
		>
			<form
				onSubmit={(e) => {
					e.preventDefault();
					if (code.trim().length === CODE_LENGTH) void verify();
				}}
				className="animate-fade-in space-y-3"
			>
				<IconInput
					icon={<Hash className="h-4 w-4" />}
					inputMode="numeric"
					autoComplete="one-time-code"
					value={code}
					onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, CODE_LENGTH))}
					maxLength={CODE_LENGTH}
					required
					autoFocus
					placeholder={t("auth.email_verification.code_placeholder", { defaultValue: "Verification code" })}
					className="font-mono tracking-[0.3em]"
				/>
				<AuthSubmitSection
					error={error}
					loading={loading}
					disabled={code.trim().length !== CODE_LENGTH}
					loadingLabel={t("auth.email_verification.verifying", { defaultValue: "Verifying..." })}
					label={t("auth.email_verification.verify", { defaultValue: "Confirm" })}
				/>
				<div className="flex justify-between text-xs">
					{required ? (
						<button type="button" onClick={() => void logoutToNextAccount().catch(() => {})} className="text-[var(--text-muted)] hover:text-[var(--text)]">
							{t("auth.email_verification.sign_out", { defaultValue: "Sign out" })}
						</button>
					) : (
						<button type="button" onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text)]">
							{t("auth.email_verification.later", { defaultValue: "Later" })}
						</button>
					)}
					<button
						type="button"
						onClick={() => void resend()}
						disabled={loading || cooldown > 0}
						className="font-semibold tabular-nums text-[var(--accent)] disabled:text-[var(--text-muted)] disabled:opacity-70"
					>
						{cooldown > 0
							? t("auth.email_verification.resend_in", { defaultValue: "Resend ({{seconds}}s)", seconds: cooldown })
							: t("auth.email_verification.resend", { defaultValue: "Send new code" })}
					</button>
				</div>
			</form>
		</AuthShell>
	);
}
