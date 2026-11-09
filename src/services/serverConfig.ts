import { invoke } from "@tauri-apps/api/core";
import { useSyncExternalStore } from "react";
import { isTauriRuntime } from "./tauriWebSocket";

/**
 * The backend the app talks to: the official servers or a self-hosted,
 * API-compatible free-grind-server. Chosen on the sign-in screen and applied
 * in Rust (src-tauri/src/api/server.rs) to REST, WebSocket and media.
 */
export type ServerInfo = {
	kind: "official" | "custom";
	apiBase: string;
	mediaBase: string | null;
};

export type ServerProbe = { ok: boolean; latencyMs: number; error: string | null };

const OFFICIAL: ServerInfo = { kind: "official", apiBase: "https://grindr.mobi", mediaBase: null };

let current: ServerInfo = OFFICIAL;
let loaded = false;
const listeners = new Set<() => void>();

function emit(next: ServerInfo) {
	current = next;
	for (const l of listeners) l();
}

export async function loadServerConfig(): Promise<ServerInfo> {
	if (!isTauriRuntime()) return current;
	const info = await invoke<ServerInfo>("get_server_config");
	loaded = true;
	emit(info);
	return info;
}

export function getServerInfo(): ServerInfo {
	if (!loaded) void loadServerConfig().catch(() => undefined);
	return current;
}

export function isCustomServer(): boolean {
	return current.kind === "custom";
}

export function useServerInfo(): ServerInfo {
	return useSyncExternalStore(
		(cb) => {
			listeners.add(cb);
			if (!loaded) void loadServerConfig().catch(() => undefined);
			return () => listeners.delete(cb);
		},
		() => current,
		() => current,
	);
}

export async function testServer(apiBase: string | null): Promise<ServerProbe> {
	return invoke<ServerProbe>("test_server", { selection: { apiBase, mediaBase: null } });
}

/** Switches the backend (signed out only). Rust rotates the device identity. */
export async function setServer(apiBase: string | null): Promise<ServerInfo> {
	const info = await invoke<ServerInfo>("set_server_config", { selection: { apiBase, mediaBase: null } });
	emit(info);
	return info;
}

/** Host shown in the UI, e.g. "api.example.org". */
export function serverLabel(info: ServerInfo): string {
	try {
		return new URL(info.apiBase).host;
	} catch {
		return info.apiBase;
	}
}
