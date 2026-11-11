import {
	type LocalVideoTrack,
	type RemoteParticipant,
	type RemoteTrack,
	type RemoteTrackPublication,
	Room,
	RoomEvent,
	Track,
	type TrackPublication,
	type VideoCaptureOptions,
} from "livekit-client";
import { appLog } from "../../utils/logger";
import type { CallHandlers, CallSession, PlayableTrack } from "./engine";

/**
 * LiveKit engine for self-hosted servers. The server's token already names
 * the room and our identity, so `channelId`/`uid` are only informative here.
 */

/** Renders a LiveKit video track into a container, like Agora's track.play(). */
function playable(track: Track): PlayableTrack {
	let element: HTMLMediaElement | null = null;
	return {
		play(container: HTMLElement) {
			// Only touch our own element: the container is React-rendered and
			// may hold React children (the camera-off avatar). Wiping it with
			// replaceChildren() makes React's later removeChild() throw.
			element?.remove();
			element = track.attach();
			element.style.width = "100%";
			element.style.height = "100%";
			element.style.objectFit = "cover";
			container.appendChild(element);
		},
		get isPlaying() {
			return !!element && element.isConnected;
		},
	};
}

export class LiveKitCallSession implements CallSession {
	private room = new Room({ adaptiveStream: true, dynacast: true });
	private facingMode: "user" | "environment" | null;
	private left = false;
	private localVideo: PlayableTrack | null = null;

	constructor(
		private readonly url: string,
		private readonly handlers: CallHandlers,
		facingMode: "user" | "environment" | null,
	) {
		this.facingMode = facingMode;
		this.room
			.on(RoomEvent.ParticipantConnected, () => this.handlers.onRemoteUserJoined?.())
			.on(RoomEvent.ParticipantDisconnected, () => this.handlers.onRemoteUserLeft?.())
			.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, _pub: RemoteTrackPublication, _p: RemoteParticipant) => {
				// Their media arriving also means they're in (covers a missed join event).
				this.handlers.onRemoteUserJoined?.();
				if (track.kind === Track.Kind.Video) this.handlers.onRemoteVideoTrack(playable(track));
				// Remote audio plays through an element LiveKit manages.
				if (track.kind === Track.Kind.Audio) track.attach();
			})
			.on(RoomEvent.TrackMuted, (pub: TrackPublication, participant) => {
				if (!participant.isLocal && pub.kind === Track.Kind.Video) this.handlers.onRemoteVideoMuteChanged?.(true);
			})
			.on(RoomEvent.TrackUnmuted, (pub: TrackPublication, participant) => {
				if (!participant.isLocal && pub.kind === Track.Kind.Video) this.handlers.onRemoteVideoMuteChanged?.(false);
			});
	}

	private cameraOptions(): VideoCaptureOptions | undefined {
		return this.facingMode ? { facingMode: this.facingMode } : undefined;
	}

	async join(_channelId: string, token: string, _uid: number, withCamera: boolean): Promise<void> {
		await this.room.connect(this.url, token);
		if (this.left) {
			await this.room.disconnect();
			return;
		}
		// Someone already in the room when we arrive.
		if (this.room.remoteParticipants.size > 0) this.handlers.onRemoteUserJoined?.();
		await this.room.localParticipant.setMicrophoneEnabled(true);
		if (withCamera) await this.enableCamera();
	}

	private async enableCamera(): Promise<void> {
		const pub = await this.room.localParticipant.setCameraEnabled(true, this.cameraOptions());
		const track = pub?.track as LocalVideoTrack | undefined;
		this.localVideo = track ? playable(track) : null;
	}

	getLocalVideoTrack(): PlayableTrack | null {
		return this.localVideo;
	}

	/** LiveKit refreshes its own connection token; nothing to feed in. */
	async renewToken(_token: string): Promise<void> {}

	setMicMuted(muted: boolean): void {
		void this.room.localParticipant.setMicrophoneEnabled(!muted).catch((e) => appLog.warn("[livekit] mic toggle failed", e));
	}

	async setCameraMuted(muted: boolean): Promise<void> {
		if (!muted && !this.localVideo) {
			await this.enableCamera();
			return;
		}
		await this.room.localParticipant.setCameraEnabled(!muted, this.cameraOptions());
	}

	async switchCamera(): Promise<void> {
		const next = this.facingMode === "environment" ? "user" : "environment";
		const pub = this.room.localParticipant.getTrackPublication(Track.Source.Camera);
		const track = pub?.track as LocalVideoTrack | undefined;
		if (track) await track.restartTrack({ facingMode: next });
		this.facingMode = next;
	}

	async leave(): Promise<void> {
		this.left = true;
		try {
			await this.room.disconnect();
		} catch (error) {
			appLog.warn("[livekit] error leaving room", error);
		}
		this.localVideo = null;
	}
}
