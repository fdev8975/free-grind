import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Globe, Server, XCircle } from "lucide-react";
import { BottomSheet, SheetCloseButton } from "../../components/ui/bottom-sheet";
import { NATIVE_SHEET_BG } from "../../components/ui/action-sheet";
import { Button } from "../../components/ui/button";
import { cn } from "../../utils/cn";
import { IconInput } from "./auth-form";
import { serverLabel, setServer, testServer, useServerInfo, type ServerProbe } from "../../services/serverConfig";

type Choice = "official" | "custom";

/**
 * "Change server" on the sign-in/up screens: official servers or a
 * self-hosted free-grind-server. Switching is only possible while signed out
 * (enforced in Rust); afterwards the UI reloads so every store starts fresh
 * against the new backend.
 */
export function ServerSelectSheet({ isDesktop, onClose }: { isDesktop: boolean; onClose: () => void }) {
	const { t } = useTranslation();
	const info = useServerInfo();
	const closeRef = useRef<(() => void) | null>(null);
	const [choice, setChoice] = useState<Choice>(info.kind);
	const [url, setUrl] = useState(info.kind === "custom" ? info.apiBase : "");
	const [probe, setProbe] = useState<ServerProbe | null>(null);
	const [busy, setBusy] = useState<"test" | "save" | null>(null);
	const [error, setError] = useState<string | null>(null);

	const target = choice === "official" ? null : url.trim();

	const runTest = async (): Promise<ServerProbe | null> => {
		if (choice === "custom" && !target) return null;
		setBusy("test");
		setError(null);
		try {
			const result = await testServer(target);
			setProbe(result);
			return result;
		} catch (e) {
			setProbe(null);
			setError(String((e as { message?: unknown })?.message ?? e));
			return null;
		} finally {
			setBusy(null);
		}
	};

	const handleSave = async (event: FormEvent) => {
		event.preventDefault();
		if (choice === "custom") {
			const result = probe?.ok ? probe : await runTest();
			if (!result?.ok) return;
		}
		setBusy("save");
		setError(null);
		try {
			await setServer(target);
			window.location.reload();
		} catch (e) {
			setError(String((e as { message?: unknown })?.message ?? e));
			setBusy(null);
		}
	};

	const option = (value: Choice, icon: ReactNode, title: string, hint: string) => (
		<button
			type="button"
			onClick={() => {
				setChoice(value);
				setProbe(null);
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
		<BottomSheet onClose={onClose} isDesktop={isDesktop} isProcessing={busy === "save"} closeRef={closeRef} bg={NATIVE_SHEET_BG} panelClassName="max-h-[92dvh] px-4">
			<div className="mb-4 flex shrink-0 items-center justify-between gap-3">
				<p className="text-sm font-semibold text-[var(--text)]">{t("auth.server.title", { defaultValue: "Server" })}</p>
				<SheetCloseButton disabled={busy === "save"} />
			</div>
			<form onSubmit={handleSave} className="-mx-4 min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-2" data-lenis-prevent>
				{option(
					"official",
					<Globe className="h-4 w-4" />,
					t("auth.server.official", { defaultValue: "Official servers" }),
					t("auth.server.official_hint", { defaultValue: "Sign in with your Grindr account." }),
				)}
				{option(
					"custom",
					<Server className="h-4 w-4" />,
					t("auth.server.custom", { defaultValue: "Own server" }),
					t("auth.server.custom_hint", { defaultValue: "A self-hosted free-grind-server. Accounts there are separate." }),
				)}
				{choice === "custom" ? (
					<div className="space-y-2">
						<IconInput
							icon={<Server className="h-4 w-4" />}
							type="url"
							inputMode="url"
							autoCapitalize="off"
							autoCorrect="off"
							spellCheck={false}
							value={url}
							onChange={(e) => {
								setUrl(e.target.value);
								setProbe(null);
							}}
							placeholder="https://api.example.org"
							required
						/>
						<p className="text-xs text-[var(--text-muted)]">
							{t("auth.server.url_hint", { defaultValue: "https is required; http only works for local addresses (e.g. 192.168.x.x)." })}
						</p>
						<button
							type="button"
							onClick={() => void runTest()}
							disabled={!target || busy != null}
							className="rounded-lg px-3 py-1.5 text-xs text-[var(--text-muted)] transition-colors hover-fill hover:text-[var(--text)] disabled:opacity-50"
						>
							{busy === "test" ? t("auth.server.testing", { defaultValue: "Testing…" }) : t("auth.server.test", { defaultValue: "Test connection" })}
						</button>
						{probe ? (
							<p className={cn("flex items-center gap-1.5 text-xs", probe.ok ? "text-[var(--success,#22c55e)]" : "text-[var(--danger,#ef4444)]")}>
								{probe.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
								{probe.ok
									? t("auth.server.reachable", { defaultValue: "Reachable ({{ms}} ms)", ms: probe.latencyMs })
									: t("auth.server.unreachable", { defaultValue: "Not reachable: {{error}}", error: probe.error ?? "" })}
							</p>
						) : null}
					</div>
				) : null}
				{error ? <p className="text-xs text-[var(--danger,#ef4444)]">{error}</p> : null}
				<Button type="submit" className="w-full" disabled={busy != null || (choice === "custom" && !target)}>
					{busy === "save" ? t("auth.server.saving", { defaultValue: "Switching…" }) : t("auth.server.save", { defaultValue: "Use this server" })}
				</Button>
				<p className="text-center text-xs text-[var(--text-muted)]">
					{t("auth.server.current", { defaultValue: "Current: {{server}}", server: info.kind === "official" ? t("auth.server.official", { defaultValue: "Official servers" }) : serverLabel(info) })}
				</p>
			</form>
		</BottomSheet>
	);
}

/** Footer button for the auth screens; shows the custom host when one is active. */
export function ServerFooterButton({ onClick }: { onClick: () => void }) {
	const { t } = useTranslation();
	const info = useServerInfo();
	return (
		<button
			type="button"
			onClick={onClick}
			className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-[var(--text-muted)] transition-colors hover-fill hover:text-[var(--text)]"
		>
			<Server className="h-3.5 w-3.5" />
			{info.kind === "custom" ? serverLabel(info) : t("auth.server.change", { defaultValue: "Change server" })}
		</button>
	);
}
