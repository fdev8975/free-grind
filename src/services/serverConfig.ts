import { invoke } from "@tauri-apps/api/core";
import { useSyncExternalStore } from "react";
import { isTauriRuntime } from "./tauriWebSocket";

/**
 * The backend the app talks to: the official servers or the Free Grind server
 * built into the app (addresses fixed at build time via FG_API_URL /
 * FG_MEDIA_URL, see grindr's server.rs; a build without them has none). Chosen on the sign-in screen and
 * applied in Rust (src-tauri/src/api/server.rs) to REST, WebSocket and media.
 */
export type ServerKind = "official" | "freeGrind";

export type ServerInfo = {
	kind: ServerKind;
	apiBase: string;
	mediaBase: string | null;
	/** Whether this build has a Free Grind server at all. */
	freeGrindAvailable: boolean;
	/** Firebase client config of the Free Grind server (build-time FG_FCM_*), while it's active. */
	fcm: FcmClientConfig | null;
};

export type FcmClientConfig = { projectId: string; applicationId: string; apiKey: string; senderId: string };

export type ServerProbe = { ok: boolean; latencyMs: number; error: string | null };

const OFFICIAL: ServerInfo = { kind: "official", apiBase: "https://grindr.mobi", mediaBase: null, freeGrindAvailable: false, fcm: null };

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

/** Display name of the built-in server. */
export const FREE_GRIND_SERVER_NAME = "Free Grind";

/** Whether the Free Grind server (not Grindr's) is active. */
export function isCustomServer(): boolean {
	return current.kind === "freeGrind";
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

/** Checks that the Free Grind server is reachable (GET /healthz). */
export async function testServer(): Promise<ServerProbe> {
	return invoke<ServerProbe>("test_server", { selection: { server: "freeGrind" } });
}

/**
 * The account a server switch parked while adding another one. Switched back
 * to on a cold start that is still signed out (the add was abandoned).
 */
const PARKED_ACCOUNT_KEY = "fg:parked-account";

export function setParkedAccount(profileId: string | null) {
	try {
		if (profileId) window.localStorage.setItem(PARKED_ACCOUNT_KEY, profileId);
		else window.localStorage.removeItem(PARKED_ACCOUNT_KEY);
	} catch {
		// Storage unavailable: an abandoned add just stays signed out.
	}
}

export function getParkedAccount(): string | null {
	try {
		return window.localStorage.getItem(PARKED_ACCOUNT_KEY);
	} catch {
		return null;
	}
}

/**
 * Switches the backend. Rust rotates the device identity. Signed out only,
 * unless `detachSession` (adding an account): then the signed-in account is
 * parked in the switcher, still valid on its own server.
 */
export async function setServer(server: ServerKind, options?: { detachSession?: boolean }): Promise<ServerInfo> {
	const info = await invoke<ServerInfo>("set_server_config", {
		selection: { server, detachSession: options?.detachSession ?? false },
	});
	emit(info);
	return info;
}
