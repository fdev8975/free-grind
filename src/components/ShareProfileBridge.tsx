/**
 * ShareProfileBridge — the chat picker behind "Share" on a profile (grid and
 * favorites tiles, inbox rows; see services/profileShare). Sends the profile
 * as a ProfileLink message to every picked chat; the chat shows it as a card
 * with the profile photo and a button to open it (ChatThreadMessages).
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { useAuth } from "../contexts/useAuth";
import { useApiFunctions } from "../hooks/useApiFunctions";
import { useAvatarCache } from "../hooks/useAvatarCache";
import { resolveAvatarSrc } from "../services/avatarStore";
import {
	clearProfileShareRequest,
	useCanShareProfiles,
	useProfileShareRequest,
	type ProfileShareRequest,
} from "../services/profileShare";
import { getParticipantAvatarUrl } from "../pages/app/chat/chatUtils";
import { ChatTargetPicker, type PickerChat } from "./ChatTargetPicker";
import { ProfileImage } from "./ui/profile-image";

export function ShareProfileBridge() {
	const { userId, settingsReady } = useAuth();
	const request = useProfileShareRequest();
	const canShare = useCanShareProfiles();
	if (!request || !canShare || !settingsReady || userId == null) return null;
	// Keyed: a new request starts over (selection, progress).
	return <ShareProfilePicker key={request.profileId} request={request} userId={userId} />;
}

function ShareProfilePicker({ request, userId }: { request: ProfileShareRequest; userId: number }) {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const api = useApiFunctions();
	useAvatarCache();
	const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
	const name = request.name?.trim() || t("common.unknown_display_name");

	const send = async (chats: PickerChat[]) => {
		if (progress || chats.length === 0) return;
		let sent = 0;
		let failed = 0;
		setProgress({ done: 0, total: chats.length });
		for (const chat of chats) {
			try {
				await api.sendMessage({
					type: "ProfileLink",
					target: { type: "Direct", targetId: Number(chat.profileId) },
					body: { profileId: request.profileId },
				});
				sent++;
			} catch {
				failed++;
			}
			setProgress({ done: sent + failed, total: chats.length });
		}
		setProgress(null);
		clearProfileShareRequest();
		if (failed > 0) {
			toast.error(
				t("chat.share_target.send_failed", {
					defaultValue: "{{failed}} of {{total}} couldn't be sent",
					failed,
					total: sent + failed,
				}),
			);
		} else {
			toast.success(
				t("chat.share_target.sent", {
					count: chats.length,
					defaultValue_one: "Sent",
					defaultValue_other: "Sent to {{count}} chats",
				}),
			);
		}
		// One chat: go there, like sharing images does. Several: stay put.
		if (chats.length === 1 && sent > 0) navigate(`/chat/${encodeURIComponent(chats[0].conversationId)}`);
	};

	return (
		<ChatTargetPicker
			userId={userId}
			title={t("chat.share_profile.title", { defaultValue: "Share profile" })}
			// They can't be sent their own profile.
			excludeProfileIds={[request.profileId]}
			isSending={progress !== null}
			onSend={(chats) => void send(chats)}
			onCancel={clearProfileShareRequest}
			headerContent={
				<>
					<p className="text-sm text-[var(--text-muted)]">
						{t("chat.share_profile.description", { defaultValue: "Choose the chats to send this profile to" })}
					</p>
					<div className="flex items-center gap-3">
						<div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-[var(--surface-2)]">
							<ProfileImage
								src={resolveAvatarSrc(request.mediaHash, getParticipantAvatarUrl(request.mediaHash))}
								alt={name}
							/>
						</div>
						<p className="min-w-0 truncate text-base font-semibold text-[var(--text)]">{name}</p>
					</div>
				</>
			}
			sendLabel={
				progress ? (
					<>
						<Loader2 className="h-4 w-4 animate-spin" />
						{t("chat.share_target.sending", {
							defaultValue: "Sending {{done}}/{{total}}",
							done: progress.done,
							total: progress.total,
						})}
					</>
				) : (
					t("chat.attachments.send")
				)
			}
		/>
	);
}
