import { useEffect, useRef } from "react";
import { useServerInfo } from "../services/serverConfig";
import { appLog } from "../utils/logger";

/**
 * Free Grind server push (Android): the server's own Firebase project comes
 * with the build (FG_FCM_* variables, like the server addresses). The native
 * side registers a second FirebaseApp for it and answers with
 * `fg:fcm-token-selfhosted`, which AuthContext sends to /v3/gcm-push-tokens.
 * Grindr's own Firebase setup for the official server is untouched. No-op on
 * desktop, on the official server and in builds without FG_FCM_*.
 */
export function SelfHostedPushBridge() {
	const { kind, fcm } = useServerInfo();
	const configured = useRef<string | null>(null);

	useEffect(() => {
		if (kind !== "freeGrind" || !fcm) return;
		const bridge = window.FreeGrindBridge;
		if (!bridge?.configureSelfHostedPush) return;
		const json = JSON.stringify(fcm);
		if (configured.current === json) return;
		configured.current = json;
		try {
			bridge.configureSelfHostedPush(json);
			appLog.debug("[PUSH_SYNC] Self-hosted Firebase configured", { projectId: fcm.projectId });
		} catch (error) {
			appLog.warn("[PUSH_SYNC] Self-hosted Firebase setup failed", error);
		}
	}, [kind, fcm]);

	return null;
}
