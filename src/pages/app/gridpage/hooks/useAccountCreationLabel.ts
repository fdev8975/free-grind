import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useFeatureFlag } from "../../../../services/assignmentsStore";
import { useServerInfo } from "../../../../services/serverConfig";
import type { ProfileDetail } from "../../../../types/grid";
import { estimateAccountCreationTimestamp, formatAccountCreationDate } from "../utils";

/**
 * The profile's "Joined …" line. With the account-creation-date flag (only the
 * Free Grind server sets it), it uses the real date the server sends as
 * `created`. Otherwise, and only on Grindr's server, it's estimated from the
 * profile ID: the anchors are Grindr's ID history and mean nothing for IDs
 * from another server. null when there's nothing to show.
 */
export function useAccountCreationLabel(): (profile: Pick<ProfileDetail, "profileId" | "created"> | null | undefined) => string | null {
	const { t } = useTranslation();
	const realDates = useFeatureFlag("account-creation-date");
	const { kind } = useServerInfo();

	return useCallback(
		(profile) => {
			if (!profile) return null;
			if (realDates && typeof profile.created === "number" && profile.created > 0) {
				return t("profile_details.joined", { date: formatAccountCreationDate(profile.created) });
			}
			if (kind !== "official") return null;
			const estimate = estimateAccountCreationTimestamp(profile.profileId);
			return estimate == null ? null : t("profile_details.estimated_joined", { date: formatAccountCreationDate(estimate) });
		},
		[kind, realDates, t],
	);
}
