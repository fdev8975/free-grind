/**
 * Call engine abstraction: the official server's calls run on Agora, a
 * self-hosted server's on LiveKit. Which one is decided per call by the
 * server's answer to POST /v1/video-call (or PATCH …/join): `provider:
 * "livekit"` plus `url` selects LiveKit; without them it is Agora, so the
 * official server keeps working exactly as before.
 *
 * VideoCallManager only talks to this interface.
 */

/** Something that can render into a container element (local or remote video). */
export interface PlayableTrack {
	play(container: HTMLElement): void;
	readonly isPlaying: boolean;
}

export interface CallHandlers {
	onRemoteVideoTrack: (track: PlayableTrack) => void;
	/** The other side actually connected to the call (not just the server). */
	onRemoteUserJoined?: () => void;
	onRemoteUserLeft?: () => void;
	/** The other side turned its camera off/on. */
	onRemoteVideoMuteChanged?: (muted: boolean) => void;
}

export interface CallSession {
	/** uid: own numeric profile id (Agora binds its token to it; LiveKit's token carries the identity). */
	join(channelId: string, token: string, uid: number, withCamera: boolean): Promise<void>;
	getLocalVideoTrack(): PlayableTrack | null;
	renewToken(token: string): Promise<void>;
	setMicMuted(muted: boolean): void;
	setCameraMuted(muted: boolean): Promise<void>;
	switchCamera(): Promise<void>;
	leave(): Promise<void>;
}

export type CallProvider = { provider: "agora" } | { provider: "livekit"; url: string };

/** Reads the provider fields of a start/join response; Agora when absent. */
export function callProviderOf(response: unknown): CallProvider {
	const r = (response ?? {}) as { provider?: unknown; url?: unknown };
	if (r.provider === "livekit" && typeof r.url === "string" && /^wss?:\/\//.test(r.url)) return { provider: "livekit", url: r.url };
	return { provider: "agora" };
}

export class WebRtcUnsupportedError extends Error {
	constructor() {
		super("RTCPeerConnection is not available in this WebView");
		this.name = "WebRtcUnsupportedError";
	}
}

export function isWebRtcSupported(): boolean {
	return typeof RTCPeerConnection !== "undefined";
}

/** Engines are loaded on demand, so the unused SDK never ends up in memory. */
export async function createCallSession(provider: CallProvider, handlers: CallHandlers, facingMode: "user" | "environment" | null): Promise<CallSession> {
	if (!isWebRtcSupported()) throw new WebRtcUnsupportedError();
	if (provider.provider === "livekit") {
		const { LiveKitCallSession } = await import("./livekitEngine");
		return new LiveKitCallSession(provider.url, handlers, facingMode);
	}
	const { AgoraCallSession } = await import("../agoraCall");
	return new AgoraCallSession(handlers, facingMode);
}
