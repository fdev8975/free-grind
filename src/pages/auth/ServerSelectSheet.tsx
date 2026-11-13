import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Globe, Server } from "lucide-react";
import { BottomSheet, SheetCloseButton } from "../../components/ui/bottom-sheet";
import { NATIVE_SHEET_BG } from "../../components/ui/action-sheet";
import { Button } from "../../components/ui/button";
import { cn } from "../../utils/cn";
import { FREE_GRIND_SERVER_NAME, setParkedAccount, setServer, testServer, useServerInfo, type ServerKind } from "../../services/serverConfig";
import { useAuth } from "../../contexts/useAuth";

/**
 * "Change server" on the sign-in/up screens: the official servers or the
 * Free Grind server built into the app (fixed addresses, set at build time).
 * Switching is only possible while signed out (enforced in Rust), except when
 * adding an account: then the signed-in account is parked in the switcher and
 * its id goes into `?restore=` so cancelling can switch back to it. Afterwards
 * the UI reloads so every store starts fresh against the new backend.
 */
export function ServerSelectSheet({
	isDesktop,
	onClose,
	addProfile = false,
}: {
	isDesktop: boolean;
	onClose: () => void;
	addProfile?: boolean;
}) {
	const { t } = useTranslation();
	const { userId } = useAuth();
	const info = useServerInfo();
	const closeRef = useRef<(() => void) | null>(null);
	const [choice, setChoice] = useState<ServerKind>(info.kind);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleSave = async (event: FormEvent) => {
		event.preventDefault();
		if (choice === info.kind) {
			onClose();
			return;
		}
		setBusy(true);
		setError(null);
		try {
			if (choice === "freeGrind") {
				const probe = await testServer();
				if (!probe.ok) {
					setError(t("auth.server.unreachable", { defaultValue: "Not reachable: {{error}}", error: probe.error ?? "" }));
					setBusy(false);
					return;
				}
			}
			const detachSession = addProfile && userId != null;
			await setServer(choice, { detachSession });
			if (detachSession) {
				setParkedAccount(String(userId));
				const url = new URL(window.location.href);
				url.searchParams.set("restore", String(userId));
				window.location.replace(url.toString());
			} else {
				window.location.reload();
			}
		} catch (e) {
			setError(String((e as { message?: unknown })?.message ?? e));
			setBusy(false);
		}
	};

	const option = (value: ServerKind, icon: ReactNode, title: string, hint: string) => (
		<button
			type="button"
			onClick={() => {
				setChoice(value);
				setError(null);
			}}
			className={cn(
				"flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors",
				choice === value ? "border-[var(--accent)] bg-[var(--surface-2)]" : "border-[var(--border)] hover-fill",
			)}
			aria-pressed={choice === value}
		>
			<span className="mt-0.5 text-[var(--text-muted)]">{icon}</span>
			<span className="min-w-0">
				<span className="block text-sm font-medium text-[var(--text)]">{title}</span>
				<span className="block text-xs text-[var(--text-muted)]">{hint}</span>
			</span>
		</button>
	);

	return (
		<BottomSheet onClose={onClose} isDesktop={isDesktop} isProcessing={busy} closeRef={closeRef} bg={NATIVE_SHEET_BG} panelClassName="max-h-[92dvh] px-4">
			<div className="mb-4 flex shrink-0 items-center justify-between gap-3">
				<p className="text-sm font-semibold text-[var(--text)]">{t("auth.server.title", { defaultValue: "Server" })}</p>
				<SheetCloseButton disabled={busy} />
			</div>
			<form onSubmit={handleSave} className="-mx-4 min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-2" data-lenis-prevent>
				{option(
					"official",
					<Globe className="h-4 w-4" />,
					t("auth.server.official", { defaultValue: "Official servers" }),
					t("auth.server.official_hint", { defaultValue: "Sign in with your Grindr account." }),
				)}
				{option(
					"freeGrind",
					<Server className="h-4 w-4" />,
					FREE_GRIND_SERVER_NAME,
					t("auth.server.free_grind_hint", { defaultValue: "The Free Grind server. Accounts there are separate from Grindr." }),
				)}
				{error ? <p className="text-xs text-[var(--danger,#ef4444)]">{error}</p> : null}
				<Button type="submit" className="w-full" disabled={busy}>
					{busy ? t("auth.server.saving", { defaultValue: "Switching…" }) : t("auth.server.save", { defaultValue: "Use this server" })}
				</Button>
			</form>
		</BottomSheet>
	);
}

/** Footer button for the auth screens; names the server that's active. */
export function ServerFooterButton({ onClick }: { onClick: () => void }) {
	const { t } = useTranslation();
	const info = useServerInfo();
	// Nothing to choose in a build without a Free Grind server.
	if (!info.freeGrindAvailable && info.kind !== "freeGrind") return null;
	return (
		<button
			type="button"
			onClick={onClick}
			title={t("auth.server.change", { defaultValue: "Change server" })}
			className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-[var(--text-muted)] transition-colors hover-fill hover:text-[var(--text)]"
		>
			<Server className="h-3.5 w-3.5" />
			{info.kind === "freeGrind" ? FREE_GRIND_SERVER_NAME : t("auth.server.official", { defaultValue: "Official servers" })}
		</button>
	);
}
