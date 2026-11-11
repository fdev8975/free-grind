import { createContext, useContext, useEffect } from "react";
import { useLocation, useNavigate, type Location } from "react-router-dom";
import { onBackButtonPress } from "@tauri-apps/api/app";
import { platform } from "@tauri-apps/plugin-os";
import { appLog } from "../utils/logger";
import { isAnyBottomSheetOpen } from "../components/ui/bottom-sheet";

const GRID_PATH = "/";

/**
 * The app's real location, provided by App. Pages rendered under a
 * background location (a profile opened over the grid, see App.tsx) see that
 * background location from useLocation() — the profile itself is on top, so
 * "are we on the grid" has to be answered from the real one.
 */
export const AppLocationContext = createContext<Location | null>(null);

function isAndroid(): boolean {
	try {
		return platform() === "android";
	} catch {
		return false;
	}
}

/**
 * Android back button fallback: when the WebView has nothing left to go back
 * to on a non-grid route, land on the grid instead of closing the app.
 *
 * This matters mostly for cold starts from a notification — the push to
 * `/chat/:id` happens without a user gesture, so Chromium marks the initial
 * `/` entry as skippable and `canGoBack` reports false, which made Tauri's
 * default handler close the app straight from the chat.
 *
 * Only registered off the grid: registering takes over the back button
 * entirely, and on the grid itself we want the system default (leave the
 * app) when there's no history left.
 */
export function useAndroidBackToGrid() {
	const routedLocation = useLocation();
	const appLocation = useContext(AppLocationContext);
	const navigate = useNavigate();
	const isOffGrid = (appLocation ?? routedLocation).pathname !== GRID_PATH;

	useEffect(() => {
		if (!isOffGrid || !isAndroid()) return;

		let cancelled = false;
		let unregister: (() => void) | null = null;

		onBackButtonPress(({ canGoBack }) => {
			// An open bottom sheet registers its own handler and closes itself.
			if (isAnyBottomSheetOpen()) return;
			if (canGoBack) {
				window.history.back();
			} else if (window.location.pathname !== GRID_PATH) {
				navigate(GRID_PATH, { replace: true });
			}
		})
			.then((listener) => {
				if (cancelled) {
					void listener.unregister();
				} else {
					unregister = () => void listener.unregister();
				}
			})
			.catch((error) => {
				appLog.warn("[BackButton] failed to register back button handler", error);
			});

		return () => {
			cancelled = true;
			unregister?.();
		};
	}, [isOffGrid, navigate]);
}
