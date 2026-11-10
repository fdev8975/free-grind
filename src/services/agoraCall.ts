import AgoraRTC, {
	type IAgoraRTCClient,
	type ICameraVideoTrack,
	type IMicrophoneAudioTrack,
} from "agora-rtc-sdk-ng";
import { appLog } from "../utils/logger";
import { type CallHandlers, type CallSession, WebRtcUnsupportedError, isWebRtcSupported } from "./videoCall/engine";

// Agora's client.join() needs an App ID separate from the per-call RTC token
// returned by POST /v1/video-call — not present anywhere in that response.
// Recovered from the real Grindr Android app's decompiled RtcEngineConfig init.
const AGORA_APP_ID = "fb9ba023bdf9430b8f75856a1bb011b9";

// Some WebKitGTK builds (confirmed on Fedora 44's webkit2gtk4.1 2.52.3) ship
// without RTCPeerConnection at all; the check lives with the engine
// abstraction now (services/videoCall/engine.ts) and is re-exported here.
export { WebRtcUnsupportedError, isWebRtcSupported } from "./videoCall/engine";

/** Agora engine: calls on the official server (see services/videoCall/engine.ts). */
export class AgoraCallSession implements CallSession {
	private client: IAgoraRTCClient;
	private micTrack: IMicrophoneAudioTrack | null = null;
	private camTrack: ICameraVideoTrack | null = null;
	// null on desktop, where there's only one camera and no facing mode to ask for.
	private facingMode: "user" | "environment" | null;
	// Set by leave(), which can run while join() is still opening the camera.
	private left = false;

	constructor(
		private readonly handlers: CallHandlers,
		facingMode: "user" | "environment" | null = null,
	) {
		this.facingMode = facingMode;
		// The real app calls setChannelProfile(1) (LIVE_BROADCASTING) rather than
		// the default COMMUNICATION profile — the Web SDK equivalent is
		// mode: "live", which requires an explicit client role since only
		// "host" (not the default "audience") is allowed to publish.
		this.client = AgoraRTC.createClient({ mode: "live", codec: "vp8" });
		this.client.on("user-joined", () => {
			this.handlers.onRemoteUserJoined?.();
		});
		this.client.on("user-published", async (user, mediaType) => {
			// Publishing implies they joined — covers a missed or late
			// user-joined, which would otherwise leave the caller ringing
			// while the callee is already in the call.
			this.handlers.onRemoteUserJoined?.();
			await this.client.subscribe(user, mediaType);
			if (mediaType === "video" && user.videoTrack) {
				this.handlers.onRemoteVideoTrack(user.videoTrack);
			}
			if (mediaType === "audio" && user.audioTrack) {
				user.audioTrack.play();
			}
		});
		this.client.on("user-left", () => {
			this.handlers.onRemoteUserLeft?.();
		});
		this.client.on("user-info-updated", (_uid, msg) => {
			if (msg === "mute-video") this.handlers.onRemoteVideoMuteChanged?.(true);
			else if (msg === "unmute-video") this.handlers.onRemoteVideoMuteChanged?.(false);
		});
	}

	// uid must be our own numeric Grindr profileId, not left to auto-assign —
	// the RTC token the backend issues is bound to that specific uid, and
	// joining with a different/null uid fails with CAN_NOT_GET_GATEWAY_SERVER
	// ("invalid token, authorized failed") even though the token itself and
	// channel name are correct.
	// Coerced because userId is a string at runtime after a fresh login
	// (LoginResult.profileId) — Agora then joins it as a string "user
	// account", which int-uid peers never see as user-joined.
	// withCamera false joins with the microphone only — the camera isn't
	// opened at all (no capture, no camera light) until setCameraMuted(false).
	async join(channelId: string, token: string, uid: number, withCamera: boolean): Promise<void> {
		if (!isWebRtcSupported()) {
			throw new WebRtcUnsupportedError();
		}
		await this.client.setClientRole("host");
		await this.client.join(AGORA_APP_ID, channelId, token, Number(uid));
		const [micTrack, camTrack] = withCamera
			? await AgoraRTC.createMicrophoneAndCameraTracks(undefined, this.cameraConfig())
			: [await AgoraRTC.createMicrophoneAudioTrack(), null];
		// The call ended while the camera was opening — leave() already ran and
		// had nothing to close, so release the devices here instead.
		if (this.left) {
			micTrack.close();
			camTrack?.close();
			return;
		}
		[this.micTrack, this.camTrack] = [micTrack, camTrack];
		await this.client.publish(camTrack ? [micTrack, camTrack] : [micTrack]);
	}

	private cameraConfig() {
		return this.facingMode ? { facingMode: this.facingMode } : undefined;
	}

	getLocalVideoTrack(): ICameraVideoTrack | null {
		return this.camTrack;
	}

	// Feeds a freshly renewed Agora token (from PATCH /v1/video-call) into the
	// already-connected client — keeps the media stream running uninterrupted,
	// unlike join() which would tear down and re-establish the connection.
	async renewToken(token: string): Promise<void> {
		await this.client.renewToken(token);
	}

	setMicMuted(muted: boolean): void {
		this.micTrack?.setMuted(muted);
	}

	// The first unmute after joining without a camera opens and publishes it;
	// the remote side then gets a regular user-published for the video.
	async setCameraMuted(muted: boolean): Promise<void> {
		if (!muted && !this.camTrack) {
			const camTrack = await AgoraRTC.createCameraVideoTrack(this.cameraConfig());
			if (this.left) {
				camTrack.close();
				return;
			}
			this.camTrack = camTrack;
			await this.client.publish(camTrack);
			return;
		}
		await this.camTrack?.setMuted(muted);
	}

	// Toggles front/back camera in place — setDevice({facingMode}) (Web SDK
	// 4.19+) swaps the underlying capture device without re-publishing, so the
	// remote side sees a brief freeze rather than the track disappearing.
	// Throws if the device has no matching camera (e.g. a desktop webcam has
	// no "environment" facing mode) — callers should show that as an error
	// rather than silently failing.
	async switchCamera(): Promise<void> {
		const next = this.facingMode === "environment" ? "user" : "environment";
		// Not opened yet (call started with the camera off) — just remember the
		// choice for when it is.
		if (this.camTrack) await this.camTrack.setDevice({ facingMode: next });
		this.facingMode = next;
	}

	async leave(): Promise<void> {
		this.left = true;
		try {
			this.micTrack?.close();
			this.camTrack?.close();
			this.micTrack = null;
			this.camTrack = null;
			await this.client.leave();
		} catch (error) {
			appLog.warn("[agora-call] error leaving channel", error);
		}
	}
}
