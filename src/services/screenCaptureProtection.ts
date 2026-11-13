import { useSyncExternalStore } from "react";
import { platform } from "@tauri-apps/plugin-os";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isTauriRuntime } from "./tauriWebSocket";

/**
 * Screenshot / screen-recording protection — on by default, a dev option
 * turns it off.
 *
 * Android: FLAG_SECURE on the activity window (MainActivity sets it in
 * onCreate already, so the splash and the Recents card are covered before
 * this runs): screenshots and recordings come out black and the Recents
 * thumbnail is blank.
 *
 * Windows/macOS: Tauri's content protection (WDA_EXCLUDEFROMCAPTURE /
 * NSWindowSharingNone): the window is left out of screenshots, recordings
 * and screen sharing.
 *
 * iOS and Linux have no API for this; the toggle does nothing there.
 */

const STORAGE_KEY = "fg-screen-capture-protection";
const listeners = new Set<() => void>();

type ProtectionBridge = { setScreenCaptureProtection?: (enabled: boolean) => void };

function readStored(): boolean {
	try {
		return window.localStorage.getItem(STORAGE_KEY) !== "off";
	} catch {
		return true;
	}
}

let enabled = readStored();

function currentPlatform(): string | null {
	if (!isTauriRuntime()) return null;
	try {
		return platform();
	} catch {
		return null;
	}
}

export function isScreenCaptureProtectionSupported(): boolean {
	const os = currentPlatform();
	if (os === "android") {
		const bridge = (window as unknown as { FreeGrindBridge?: ProtectionBridge }).FreeGrindBridge;
		return typeof bridge?.setScreenCaptureProtection === "function";
	}
	return os === "windows" || os === "macos";
}

function applyNative(next: boolean): void {
	const os = currentPlatform();
	if (os === "android") {
		(window as unknown as { FreeGrindBridge?: ProtectionBridge }).FreeGrindBridge?.setScreenCaptureProtection?.(next);
	} else if (os === "windows" || os === "macos") {
		getCurrentWindow()
			.setContentProtected(next)
			.catch((error) => console.error("[screenCaptureProtection] failed to apply", error));
	}
}

/** Applies the stored choice to the native window; call once on boot. */
export function installScreenCaptureProtection(): void {
	applyNative(enabled);
}

export function isScreenCaptureProtectionEnabled(): boolean {
	return enabled;
}

export function setScreenCaptureProtectionEnabled(next: boolean): void {
	if (next === enabled) return;
	enabled = next;
	try {
		if (next) window.localStorage.removeItem(STORAGE_KEY);
		else window.localStorage.setItem(STORAGE_KEY, "off");
	} catch {
		// Storage unavailable: the choice holds for this session only.
	}
	applyNative(next);
	for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

/** Whether protection is on; follows changes live. */
export function useScreenCaptureProtectionEnabled(): boolean {
	return useSyncExternalStore(subscribe, isScreenCaptureProtectionEnabled, isScreenCaptureProtectionEnabled);
}
