import { useEffect, useRef } from "react";
import { useAssignment } from "../services/assignmentsStore";
import { isCustomServer } from "../services/serverConfig";
import { appLog } from "../utils/logger";

/**
 * Self-hosted server push (Android): its public `push_fcm_config` assignment
 * names the server's own Firebase project. The native side registers a second
 * FirebaseApp for it and answers with `fg:fcm-token-selfhosted`, which
 * AuthContext sends to /v3/gcm-push-tokens. Grindr's own Firebase setup for
 * the official server is untouched. No-op on desktop and the official server.
 */
type FcmClientConfig = { projectId: string; applicationId: string; apiKey: string; senderId: string };

function isConfig(value: unknown): value is FcmClientConfig {
	if (!value || typeof value !== "object") return false;
	const v = value as Record<string, unknown>;
	return ["projectId", "applicationId", "apiKey", "senderId"].every((k) => typeof v[k] === "string" && v[k]);
}

export function SelfHostedPushBridge() {
	const assignment = useAssignment("push_fcm_config");
	const configured = useRef<string | null>(null);

	useEffect(() => {
		if (!isCustomServer() || assignment?.value !== "on" || !isConfig(assignment.payload)) return;
		const bridge = window.FreeGrindBridge;
		if (!bridge?.configureSelfHostedPush) return;
		const json = JSON.stringify(assignment.payload);
		if (configured.current === json) return;
		configured.current = json;
		try {
			bridge.configureSelfHostedPush(json);
			appLog.debug("[PUSH_SYNC] Self-hosted Firebase configured", { projectId: assignment.payload.projectId });
		} catch (error) {
			appLog.warn("[PUSH_SYNC] Self-hosted Firebase setup failed", error);
		}
	}, [assignment]);

	return null;
}
