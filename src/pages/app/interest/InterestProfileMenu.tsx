import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { GridTileContextMenu } from "../gridpage/components/GridTileContextMenu";
import { useLocateProfile } from "../gridpage/hooks/useLocateProfile";
import { usePresence } from "../../../hooks/usePresence";
import { getNicknameRename } from "../../../hooks/useNicknameNameChange";
import { useApiFunctions } from "../../../hooks/useApiFunctions";
import { useBlockProfile } from "../../../hooks/queries/useProfileQueries";
import { ConfirmDialog } from "../../../components/ui/confirm-dialog";
import { PromptDialog } from "../../../components/ui/prompt-dialog";
import { getLocalNicknamesForProfiles, setLocalNicknameForProfile } from "../../../services/chatContactIndex";
import { hideProfile as hideProfileLocally } from "../../../services/profileHide";
import { requestProfileShare, useCanShareProfiles } from "../../../services/profileShare";
import { SKIP_BLOCK_CONFIRM_KEY, isBlockConfirmSkipped } from "../../../utils/blockConfirm";
import { isLocateEnabled } from "../../../utils/optionalFeatures";
import type { InterestItem } from "./interestUtils";

export type InterestMenuTarget = {
	item: InterestItem;
	isFavorite: boolean;
	x: number;
	y: number;
};

/**
 * The browse grid's tile menu (GridTileContextMenu) for Interest tiles and
 * rows: message, share, favorite, nickname, locate, hide, block — with the
 * nickname prompt and block confirmation those need. Opened by long press /
 * right-click (useTileMenuPress) on an openable, unblocked profile.
 */
export function InterestProfileMenu({
	target,
	isDesktop,
	onClose,
	onFavoriteChanged,
}: {
	target: InterestMenuTarget | null;
	isDesktop: boolean;
	onClose: () => void;
	/** The views endpoint's favorite flag is stale after a toggle; the page overrides it. */
	onFavoriteChanged: (profileId: string, favorite: boolean) => void;
}) {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const location = useLocation();
	const apiFunctions = useApiFunctions();
	const presence = usePresence(target);
	const rendered = presence.rendered;
	const canShareProfiles = useCanShareProfiles();
	const { handleTriangleProfile, locateLabelFor } = useLocateProfile();
	// Read on mount like the grid does; toggled in Optional Features.
	const [showLocate] = useState(isLocateEnabled);
	const { mutateAsync: blockProfileMutation, isPending: isBlockingProfile } = useBlockProfile();

	const [nickname, setNickname] = useState<{ profileId: string; value: string | null } | null>(null);
	const [nicknamePromptItem, setNicknamePromptItem] = useState<InterestItem | null>(null);
	const [isSavingNickname, setIsSavingNickname] = useState(false);
	const [pendingBlockId, setPendingBlockId] = useState<string | null>(null);
	const [dontAskAgain, setDontAskAgain] = useState(false);

	// The menu's nickname action reads "Set" or "Edit": look the nickname up on open.
	const targetProfileId = target?.item.profileId ?? null;
	useEffect(() => {
		if (!targetProfileId) return;
		let cancelled = false;
		void getLocalNicknamesForProfiles([targetProfileId])
			.then((map) => {
				if (!cancelled) setNickname({ profileId: targetProfileId, value: map[targetProfileId] ?? null });
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, [targetProfileId]);

	const nicknameFor = (profileId: string) => (nickname?.profileId === profileId ? nickname.value : null);

	const performBlock = useCallback(
		async (profileId: string) => {
			try {
				await blockProfileMutation(profileId);
				toast.success(t("profile_details.block_success"));
			} catch (error) {
				toast.error(error instanceof Error ? error.message : t("profile_details.block_failed"));
			}
		},
		[blockProfileMutation, t],
	);

	const toggleFavorite = async (profileId: string, currentlyFavorite: boolean) => {
		try {
			if (currentlyFavorite) await apiFunctions.removeFavorite(profileId);
			else await apiFunctions.addFavorite(profileId);
			onFavoriteChanged(profileId, !currentlyFavorite);
			toast.success(currentlyFavorite ? t("favorites.removed") : t("favorites.added"));
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: currentlyFavorite
						? t("favorites.remove_failed")
						: t("favorites.add_failed"),
			);
		}
	};

	const saveNickname = async (value: string) => {
		if (!nicknamePromptItem) return;
		const profileId = nicknamePromptItem.profileId;
		const normalized = value.trim() || null;
		setIsSavingNickname(true);
		try {
			await setLocalNicknameForProfile(profileId, normalized);
			setNickname({ profileId, value: normalized });
			toast.success(normalized ? t("chat.nicknames.saved") : t("chat.nicknames.cleared"));
			setNicknamePromptItem(null);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : t("chat.nicknames.save_failed"));
		} finally {
			setIsSavingNickname(false);
		}
	};

	const promptNickname = nicknamePromptItem ? nicknameFor(nicknamePromptItem.profileId) : null;
	const promptRealName = nicknamePromptItem?.displayName ?? "";

	return (
		<>
			{rendered ? (() => {
				const { item, isFavorite } = rendered;
				const profileId = item.profileId;
				const currentNickname = nicknameFor(profileId);
				return (
					<GridTileContextMenu
						visible={presence.visible}
						x={rendered.x}
						y={rendered.y}
						isDesktop={isDesktop}
						title={currentNickname?.trim() || item.displayName || t("common.unknown_display_name")}
						isFavorite={isFavorite}
						hasNickname={Boolean(currentNickname)}
						nicknameRename={getNicknameRename(currentNickname, item.displayName, null)}
						onClose={onClose}
						onMessage={() => {
							const params = new URLSearchParams();
							params.set("targetProfileId", profileId);
							params.set("returnTo", `${location.pathname}${location.search}`);
							navigate(`/chat?${params.toString()}`);
						}}
						onShare={canShareProfiles ? () => requestProfileShare({
							profileId: Number(profileId),
							name: item.displayName,
							mediaHash: item.imageHash,
						}) : undefined}
						onToggleFavorite={() => void toggleFavorite(profileId, isFavorite)}
						onEditNickname={() => setNicknamePromptItem(item)}
						onHide={() => {
							void hideProfileLocally(profileId, item.displayName, item.imageHash);
							toast.success(t("profile_details.hide_success"));
						}}
						onBlock={() => {
							if (isBlockConfirmSkipped()) {
								void performBlock(profileId);
								return;
							}
							setDontAskAgain(false);
							setPendingBlockId(profileId);
						}}
						onLocate={showLocate && item.distanceMeters != null ? () => handleTriangleProfile(profileId) : undefined}
						locateLabel={locateLabelFor(profileId)}
					/>
				);
			})() : null}

			<PromptDialog
				isOpen={nicknamePromptItem !== null}
				title={promptNickname ? t("chat.nicknames.edit") : t("chat.nicknames.set")}
				message={t("chat.nicknames.prompt")}
				defaultValue={promptNickname || promptRealName}
				placeholder={promptRealName || undefined}
				confirmLabel={t("common.save", { defaultValue: "Save" })}
				cancelLabel={t("chat.actions.cancel")}
				onConfirm={saveNickname}
				onCancel={() => setNicknamePromptItem(null)}
				isProcessing={isSavingNickname}
				allowEmpty
				rows={1}
			/>

			<ConfirmDialog
				isOpen={pendingBlockId !== null}
				title={t("profile_details.block")}
				message={t("profile_details.block_confirm")}
				confirmLabel={t("profile_details.block")}
				cancelLabel={t("chat.actions.cancel")}
				onConfirm={() => {
					if (!pendingBlockId) return;
					if (dontAskAgain) localStorage.setItem(SKIP_BLOCK_CONFIRM_KEY, "true");
					const profileId = pendingBlockId;
					setPendingBlockId(null);
					void performBlock(profileId);
				}}
				onCancel={() => !isBlockingProfile && setPendingBlockId(null)}
				isProcessing={isBlockingProfile}
				confirmTone="danger"
				dontAskAgainLabel={t("profile_details.dont_ask_again")}
				dontAskAgainChecked={dontAskAgain}
				onDontAskAgainChange={setDontAskAgain}
			/>
		</>
	);
}
