import { useEffect, useMemo, useState } from "react";
import { Hourglass, Loader2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { sendChatMediaBatch, UNLIMITED_VIEWS, type BatchSendResult } from "../services/chatMediaSend";
import { useApiFunctions } from "../hooks/useApiFunctions";
import { usePreferences } from "../contexts/PreferencesContext";
import { AllowanceCounter, tighterAllowance, useAllowanceHint, useResetWhenBlocked } from "./ExpiringAllowance";
import { useExpiringAllowanceInfo } from "../hooks/queries/useEntitlementQueries";
import { ChatTargetPicker, type PickerChat } from "./ChatTargetPicker";

const PREVIEW_COUNT = 6;

/**
 * "Send to…" chooser for images shared in from Android's share sheet without
 * a Direct Share target (see ShareTargetBridge): the shared images (each can
 * be dropped again) above the chat list (ChatTargetPicker). Send uploads
 * each image once and sends all of them to every selected chat (see
 * chatMediaSend), with one shared "View once" choice instead of the
 * per-image attachment dialog.
 */
export function ShareChatPicker({
	files,
	userId,
	onSent,
	onChangeFiles,
	onCancel,
}: {
	files: File[];
	userId: number;
	/** After a send, successful or not; the picker has done nothing else yet. */
	onSent: (conversationIds: string[], result: BatchSendResult) => void;
	onChangeFiles: (files: File[]) => void;
	onCancel: () => void;
}) {
	const { t } = useTranslation();
	const { defaultExpiringPhotos } = usePreferences();
	const [viewOnce, setViewOnce] = useState(Boolean(defaultExpiringPhotos));
	const hasVideo = files.some((file) => file.type.startsWith("video/"));
	const hasImage = files.some((file) => !file.type.startsWith("video/"));
	const picsAllowance = useExpiringAllowanceInfo("pics", hasImage);
	const videosAllowance = useExpiringAllowanceInfo("videos", hasVideo);
	const allowance = hasImage && hasVideo ? tighterAllowance(picsAllowance, videosAllowance) : hasVideo ? videosAllowance : picsAllowance;
	const allowanceHint = useAllowanceHint(allowance);
	useResetWhenBlocked(allowance.blocked, viewOnce, () => setViewOnce(false));
	const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
	const api = useApiFunctions();
	const isSending = progress !== null;

	const previews = useMemo(
		() => files.slice(0, PREVIEW_COUNT).map((file) => ({ file, url: URL.createObjectURL(file) })),
		[files],
	);
	useEffect(() => () => previews.forEach((preview) => URL.revokeObjectURL(preview.url)), [previews]);

	const send = async (selectedChats: PickerChat[]) => {
		if (isSending || selectedChats.length === 0) return;
		setProgress({ done: 0, total: files.length * selectedChats.length });
		const result = await sendChatMediaBatch(
			api,
			files,
			selectedChats.map((chat) => chat.profileId),
			{ maxViews: viewOnce ? 1 : UNLIMITED_VIEWS },
			(done, total) => setProgress({ done, total }),
		);
		setProgress(null);
		onSent(
			selectedChats.map((chat) => chat.conversationId),
			result,
		);
	};

	const removeFile = (file: File) => {
		const remaining = files.filter((candidate) => candidate !== file);
		if (remaining.length === 0) onCancel();
		else onChangeFiles(remaining);
	};

	return (
		<ChatTargetPicker
			userId={userId}
			title={t("chat.share_target.title", { defaultValue: "Send to…" })}
			isSending={isSending}
			onSend={(chats) => void send(chats)}
			onCancel={onCancel}
			headerContent={
				<>
					<p className="text-sm text-[var(--text-muted)]">
						{t("chat.share_target.description", {
							count: files.length,
							defaultValue_one: "Choose a chat to send the image to",
							defaultValue_other: "Choose a chat to send {{count}} images to",
						})}
					</p>

					<div className="flex gap-2 overflow-x-auto" data-lenis-prevent>
						{previews.map(({ file, url }) => (
							<div key={url} className="relative shrink-0">
								<img src={url} alt="" className="h-16 w-16 rounded-xl object-cover" />
								<button
									type="button"
									onClick={() => removeFile(file)}
									aria-label={t("chat.share_target.remove_image", { defaultValue: "Remove image" })}
									className="absolute end-1 top-1 rounded-full bg-black/60 p-0.5 text-white"
								>
									<X className="h-3.5 w-3.5" />
								</button>
							</div>
						))}
						{files.length > previews.length ? (
							<div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-2)] text-sm font-semibold text-[var(--text-muted)]">
								+{files.length - previews.length}
							</div>
						) : null}
					</div>
				</>
			}
			footerStart={
				<button
					type="button"
					onClick={() => {
						if (!viewOnce && allowanceHint && (allowance.blocked || allowance.needsBypass)) {
							// Blocked: say why instead of toggling. Bypass: toggle, but say what sending will ask.
							if (allowance.blocked) {
								toast.error(allowanceHint, { id: "expiring-allowance" });
								return;
							}
							toast(allowanceHint, { id: "expiring-allowance" });
						}
						setViewOnce((value) => !value);
					}}
					disabled={isSending}
					aria-pressed={viewOnce}
					aria-disabled={allowance.blocked || undefined}
					title={allowanceHint ?? t("chat.attachments.view_once_description")}
					className={`inline-flex h-12 min-w-[120px] items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold transition active:scale-[0.97] disabled:opacity-50 ${viewOnce ? "accent-tint-15 text-[var(--accent)]" : "ink-tint-10 text-[var(--text)] hover:ink-tint-14"}`}
				>
					<Hourglass className={`h-4 w-4 shrink-0 ${viewOnce ? "" : "text-[var(--text-muted)]"}`} />
					{viewOnce
						? t("chat_drawer.expiry.ten_seconds", { defaultValue: "10s" })
						: t("chat_drawer.expiry.unlimited", { defaultValue: "Unlimited" })}
					<AllowanceCounter info={allowance} />
				</button>
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
				) : viewOnce ? (
					t("chat.attachments.send_expiring")
				) : (
					t("chat.attachments.send")
				)
			}
		/>
	);
}
