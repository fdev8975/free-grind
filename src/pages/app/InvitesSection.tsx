import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { Copy, Loader2, Plus, Share2, Ticket, X } from "lucide-react";
import { useApi } from "../../hooks/useApi";
import { parseJsonSafe } from "../../services/apiHelpers";
import { useFeatureFlag } from "../../services/assignmentsStore";
import { FREE_GRIND_SERVER_NAME, useServerInfo } from "../../services/serverConfig";
import { appLog } from "../../utils/logger";

type InviteStatus = "active" | "used" | "expired" | "revoked";

type Invite = {
	code: string;
	status: InviteStatus;
	uses: number;
	maxUses: number;
	createdAt: number;
	expiresAt: number | null;
};

type InvitesState = {
	enabled: boolean;
	/** 0 = unlimited. */
	limit: number;
	/** null = unlimited. */
	remaining: number | null;
	/** Accounts registered with this user's invites. */
	registrations: number;
	invites: Invite[];
};

/**
 * Registration invites on a Free Grind server (server extension), shown under
 * the profile list in Settings while the flag `user_invites` is on for the
 * account. Lists the open codes; used ones only count towards `registrations`.
 */
export function InvitesSection() {
	const { t, i18n } = useTranslation();
	const server = useServerInfo();
	const enabled = useFeatureFlag("user_invites");
	const { fetchRest } = useApi();
	const [state, setState] = useState<InvitesState | null>(null);
	const [creating, setCreating] = useState(false);
	const [revoking, setRevoking] = useState<string | null>(null);

	const active = server.kind === "freeGrind" && enabled;

	const load = useCallback(async () => {
		try {
			const res = await fetchRest("/v1/me/invites");
			if (res.status >= 400) throw new Error(`HTTP ${res.status}`);
			setState((await parseJsonSafe(res)) as InvitesState);
		} catch (error) {
			appLog.warn("[invites] load failed", error);
		}
	}, [fetchRest]);

	useEffect(() => {
		if (active) void load();
		else setState(null);
	}, [active, load]);

	if (!active || !state?.enabled) return null;

	const openInvites = state.invites.filter((invite) => invite.status === "active");
	const canCreate = state.remaining === null || state.remaining > 0;

	const shareText = (code: string) =>
		t("settings.invites.share_text", {
			defaultValue: "Join me on {{server}}! Use my invite code when you sign up: {{code}}",
			server: FREE_GRIND_SERVER_NAME,
			code,
		});

	const copy = async (code: string) => {
		try {
			await navigator.clipboard.writeText(code);
			toast.success(t("settings.invites.copied", { defaultValue: "Invite code copied" }));
		} catch {
			toast.error(t("settings.invites.copy_failed", { defaultValue: "Couldn't copy the code" }));
		}
	};

	const share = async (code: string) => {
		if (typeof navigator.share === "function") {
			try {
				await navigator.share({ text: shareText(code) });
				return;
			} catch (error) {
				// Closed by the user: nothing else to do.
				if (error instanceof DOMException && error.name === "AbortError") return;
			}
		}
		try {
			await navigator.clipboard.writeText(shareText(code));
			toast.success(t("settings.invites.share_copied", { defaultValue: "Invite text copied" }));
		} catch {
			await copy(code);
		}
	};

	const create = async () => {
		if (creating || !canCreate) return;
		setCreating(true);
		try {
			const res = await fetchRest("/v1/me/invites", { method: "POST", body: {} });
			if (res.status === 402) {
				toast.error(t("settings.invites.limit_reached", { defaultValue: "You've used all your invites." }));
			} else if (res.status === 429) {
				toast.error(t("settings.invites.too_many", { defaultValue: "Too many requests. Please wait a moment." }));
			} else if (res.status >= 400) {
				throw new Error(`HTTP ${res.status}`);
			} else {
				const body = (await parseJsonSafe(res)) as { invite?: Invite };
				if (body.invite) void share(body.invite.code);
			}
		} catch (error) {
			appLog.warn("[invites] create failed", error);
			toast.error(t("settings.invites.create_failed", { defaultValue: "Couldn't create an invite. Please try again." }));
		} finally {
			setCreating(false);
			void load();
		}
	};

	const revoke = async (code: string) => {
		setRevoking(code);
		try {
			const res = await fetchRest(`/v1/me/invites/${encodeURIComponent(code)}`, { method: "DELETE" });
			if (res.status >= 400 && res.status !== 404) throw new Error(`HTTP ${res.status}`);
		} catch (error) {
			appLog.warn("[invites] revoke failed", error);
			toast.error(t("settings.invites.revoke_failed", { defaultValue: "Couldn't withdraw the invite." }));
		} finally {
			setRevoking(null);
			void load();
		}
	};

	const dateFormat = new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium" });

	const summary =
		state.remaining === null
			? t("settings.invites.summary_unlimited", {
					defaultValue: "{{count}} people joined with your invites",
					count: state.registrations,
				})
			: t("settings.invites.summary", {
					defaultValue: "{{count}} people joined with your invites · {{remaining}} of {{limit}} invites left",
					count: state.registrations,
					remaining: state.remaining,
					limit: state.limit,
				});

	return (
		<div className="min-w-0">
			<p className="mb-2 px-1 text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">
				{t("settings.invites.title", { defaultValue: "Invites" })}
			</p>
			<div className="native-group">
				<button
					type="button"
					onClick={() => void create()}
					disabled={creating || !canCreate}
					className="flex w-full items-center gap-3 px-4 py-3.5 text-start transition-colors hover-fill disabled:cursor-not-allowed disabled:opacity-60"
				>
					<div className="shrink-0 rounded-2xl bg-emerald-500/15 p-2.5 text-emerald-400">
						{creating ? <Loader2 className="h-5 w-5 animate-spin" /> : <Plus className="h-5 w-5" />}
					</div>
					<div className="min-w-0 flex-1">
						<p className="text-sm font-semibold leading-snug">
							{canCreate
								? t("settings.invites.create", { defaultValue: "Invite someone" })
								: t("settings.invites.none_left", { defaultValue: "No invites left" })}
						</p>
						<p className="mt-0.5 text-xs leading-snug text-[var(--text-muted)]">{summary}</p>
					</div>
				</button>

				{openInvites.map((invite) => (
					<div key={invite.code} className="flex items-center gap-1 transition-colors hover-fill">
						<button
							type="button"
							onClick={() => void copy(invite.code)}
							className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-start"
						>
							<div className="shrink-0 rounded-2xl bg-slate-500/15 p-2.5 text-slate-400">
								<Ticket className="h-5 w-5" />
							</div>
							<div className="min-w-0 flex-1">
								<p className="truncate font-mono text-sm font-semibold leading-snug tracking-wider">{invite.code}</p>
								<p className="mt-0.5 text-xs leading-snug text-[var(--text-muted)]">
									{invite.expiresAt
										? t("settings.invites.expires", {
												defaultValue: "Valid until {{date}}",
												date: dateFormat.format(new Date(invite.expiresAt)),
											})
										: t("settings.invites.no_expiry", { defaultValue: "Doesn't expire" })}
								</p>
							</div>
							<Copy className="h-4 w-4 shrink-0 text-[var(--text-muted)] opacity-60" />
						</button>
						<button
							type="button"
							onClick={() => void share(invite.code)}
							aria-label={t("settings.invites.share", { defaultValue: "Share invite" })}
							title={t("settings.invites.share", { defaultValue: "Share invite" })}
							className="shrink-0 rounded-full p-2.5 text-[var(--text-muted)] transition hover:ink-tint-10 hover:text-[var(--text)]"
						>
							<Share2 className="h-4 w-4" />
						</button>
						<button
							type="button"
							onClick={() => void revoke(invite.code)}
							disabled={revoking === invite.code}
							aria-label={t("settings.invites.revoke", { defaultValue: "Withdraw invite" })}
							title={t("settings.invites.revoke", { defaultValue: "Withdraw invite" })}
							className="me-2 shrink-0 rounded-full p-2.5 text-[var(--text-muted)] transition hover:bg-red-500/12 hover:text-red-500 disabled:opacity-60"
						>
							{revoking === invite.code ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
						</button>
					</div>
				))}
			</div>
		</div>
	);
}
