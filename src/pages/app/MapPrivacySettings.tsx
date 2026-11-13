import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Shuffle } from "lucide-react";
import { EyeOffFilled, ImagesFilled, LocateApproximateFilled, LocateFixedFilled, MapPinFilled } from "../../components/icons/FilledIcons";
import { SelectRow } from "../../components/ui/select-row";
import type { SelectSheetOption } from "../../components/ui/select-sheet";
import { ToggleRow } from "../../components/ui/toggle-row";
import { Slider } from "../../components/ui/range-slider";
import { usePreferences } from "../../contexts/PreferencesContext";
import { useApiFunctions } from "../../hooks/useApiFunctions";
import { useMyOwnProfile, useMySettings } from "../../hooks/queries/useProfileQueries";
import { unwrapOwnProfile } from "./profile-editor/profileEditorUtils";
import type { MySettings } from "../../types/api-functions";

// Location Randomizer range in the official app (26.21: "Less" … "More").
const MAP_FUZZ_RADIUS_MIN = 50;
const MAP_FUZZ_RADIUS_MAX = 1500;
const MAP_FUZZ_RADIUS_STEP = 50;

/** Account settings (/v3/me/prefs/settings), applied right away like the
 * rest of the privacy page: shown at once, rolled back if the server refuses. */
function useAccountSettings() {
	const { t } = useTranslation();
	const apiFunctions = useApiFunctions();
	const queryClient = useQueryClient();
	const { data: settings } = useMySettings();

	const update = async (patch: Partial<MySettings>) => {
		if (!settings) return;
		queryClient.setQueryData(["my-settings"], { ...settings, ...patch });
		try {
			await apiFunctions.updateMySettings(patch);
		} catch (error) {
			queryClient.setQueryData(["my-settings"], settings);
			toast.error(error instanceof Error ? error.message : t("profile_editor.toasts.error_update"));
		}
	};

	return { settings, update };
}

export type DistanceMode = "precise" | "approximate" | "hidden";

/** Same three modes as the official app's "Distance & Visibility" screen.
 * Shared by Browse's distance sheet and the privacy page. `distanceMode` is
 * null until the own profile has loaded. */
export function useDistanceMode() {
	const { t } = useTranslation();
	const apiFunctions = useApiFunctions();
	const queryClient = useQueryClient();
	const { data: myProfile } = useMyOwnProfile();

	const distanceMode: DistanceMode | null = !myProfile
		? null
		: !(myProfile.showDistance ?? true)
			? "hidden"
			: myProfile.approximateDistance
				? "approximate"
				: "precise";

	// Mirrors the official app: the mode goes onto the profile
	// (showDistance + approximateDistance), and approximateDistance is also
	// written to the account settings. Rejects on failure so the sheet stays open.
	// The profile write has to be the full PUT /v3.1/me/profile — PATCH /v4
	// ignores approximateDistance — so the current profile is fetched fresh and
	// sent back whole with just these two fields changed.
	const selectDistanceMode = useCallback(async (mode: DistanceMode) => {
		const fields = {
			showDistance: mode !== "hidden",
			approximateDistance: mode === "approximate",
		};
		const previous = queryClient.getQueryData<typeof myProfile>(["my-own-profile"]);
		queryClient.setQueryData(["my-own-profile"], (current: typeof myProfile) =>
			current ? { ...current, ...fields } : current,
		);
		try {
			const current = unwrapOwnProfile(await apiFunctions.getMyOwnProfile());
			if (!current) throw new Error("Own profile unavailable");
			await apiFunctions.replaceMyProfile({ ...current, ...fields });
			await apiFunctions.updateMySettings({ approximateDistance: fields.approximateDistance });
		} catch (error) {
			queryClient.setQueryData(["my-own-profile"], previous);
			toast.error(t("browse_page.errors.toggle_distance_failed", { defaultValue: "Could not update distance setting." }));
			throw error;
		}
	}, [apiFunctions, queryClient, t]);

	const distanceOptions = useMemo<SelectSheetOption<DistanceMode>[]>(() => [
		{
			value: "precise",
			icon: LocateFixedFilled,
			iconClassName: "accent-tint-15 text-[var(--accent)]",
			label: t("browse_page.share_distance.precise", { defaultValue: "Precise" }),
			description: t("browse_page.share_distance.precise_desc", { defaultValue: "Exact distance, e.g. \"250 m away\"." }),
		},
		{
			value: "approximate",
			icon: LocateApproximateFilled,
			iconClassName: "bg-sky-500/15 text-sky-400",
			label: t("browse_page.share_distance.approximate", { defaultValue: "Approximate" }),
			description: t("browse_page.share_distance.approximate_desc", { defaultValue: "Rounded, e.g. \"< 5 km away\"." }),
		},
		{
			value: "hidden",
			icon: EyeOffFilled,
			label: t("browse_page.share_distance.hidden", { defaultValue: "Hidden" }),
			description: t("browse_page.share_distance.hidden_desc", { defaultValue: "No distance shown. Your position in others' grid still hints at roughly how far away you are." }),
		},
	], [t]);

	return { distanceMode, selectDistanceMode, distanceOptions };
}

/** Privacy page row for the distance mode, in the same sheet as Browse's. */
function DistanceModeRow({ highlightId }: { highlightId: string | null }) {
	const { t } = useTranslation();
	const { distanceMode, selectDistanceMode, distanceOptions } = useDistanceMode();
	if (!distanceMode) return null;
	const current = distanceOptions.find((option) => option.value === distanceMode)!;
	const Icon = current.icon!;

	return (
		<SelectRow<DistanceMode>
			id="privacy-share-distance"
			highlighted={highlightId === "privacy-share-distance"}
			icon={<Icon className="h-5 w-5" />}
			iconClass={current.iconClassName ?? "bg-[var(--surface-2)] text-[var(--text-muted)]"}
			label={t("browse_page.share_distance.title", { defaultValue: "Share Distance" })}
			description={t("browse_page.share_distance.description", { defaultValue: "Choose how your distance appears to others." })}
			value={distanceMode}
			onChange={selectDistanceMode}
			options={distanceOptions}
		/>
	);
}

/** Privacy page section: how your distance is shown, whether you show up on
 * the map, and how far your position there is offset. Hidden until the settings have loaded. */
export function MapVisibilitySection({ highlightId }: { highlightId: string | null }) {
	const { t } = useTranslation();
	const { data: settings } = useMySettings();
	if (!settings) return null;

	return (
		<div>
			<p className="mb-2 px-1 text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">
				{t("privacy.distance_map", { defaultValue: "Distance & Map" })}
			</p>
			<div className="native-group">
				<DistanceModeRow highlightId={highlightId} />
				<MapVisibilityControls highlightId={highlightId} />
			</div>
		</div>
	);
}

/** "Show Me on Map" toggle plus the Location Randomizer slider (while shown).
 * Shared by the privacy page (`group`: rows of a native-group card) and
 * Browse's distance sheet (`sheet`: rounded rows like the sheet's options);
 * renders nothing until the settings have loaded. */
export function MapVisibilityControls({ highlightId, variant = "group" }: {
	/** Privacy page only: gives the toggle its settings-search anchor. */
	highlightId?: string | null;
	variant?: "group" | "sheet";
}) {
	const { t } = useTranslation();
	const { unitsPreset } = usePreferences();
	const { settings, update } = useAccountSettings();
	// The slider's value while dragging; it's only sent on release.
	const [draftRadius, setDraftRadius] = useState<number | null>(null);
	if (!settings) return null;

	const isImperial = unitsPreset === "uk" || unitsPreset === "american";
	const radius = draftRadius ?? settings.mapLocationFuzzRadius ?? null;
	const radiusLabel = radius == null
		? t("profile_editor.sections.map.radius_default", { defaultValue: "Default" })
		: isImperial
			? t("profile_editor.sections.map.radius_ft", {
					defaultValue: "~{{value}} ft radius",
					value: Math.round(radius * 3.280839895),
				})
			: t("profile_editor.sections.map.radius_m", {
					defaultValue: "~{{value}} m radius",
					value: radius,
				});
	const isSheet = variant === "sheet";
	const rowPadding = isSheet ? "px-3 py-3" : "px-4 py-3.5";

	return (
		<>
			<div className={isSheet ? "overflow-hidden rounded-2xl" : undefined}>
				<ToggleRow
					id={highlightId !== undefined ? "privacy-show-on-map" : undefined}
					highlighted={highlightId === "privacy-show-on-map"}
					icon={<MapPinFilled className="h-5 w-5" />}
					iconClass="bg-emerald-500/15 text-emerald-400"
					label={t("profile_editor.sections.map.show_on_map", { defaultValue: "Show Me on Map" })}
					description={t("profile_editor.sections.map.show_on_map_desc", {
						defaultValue: "Your profile appears on the map, always offset from your actual location.",
					})}
					checked={settings.showOnMap}
					onChange={(checked) => void update({ showOnMap: checked })}
					padding={rowPadding}
				/>
			</div>
			{settings.showOnMap && (
				// Same layout as the toggle row above: icon tile, then label/value,
				// description and the slider in the text column.
				<div className={`flex items-start gap-3 ${rowPadding}`}>
					<div className="shrink-0 rounded-2xl bg-teal-500/15 p-2.5 text-teal-400">
						<Shuffle className="h-5 w-5" />
					</div>
					<div className="min-w-0 flex-1">
						<div className="flex items-baseline justify-between gap-3">
							<span className="text-sm font-semibold leading-snug">
								{t("profile_editor.sections.map.location_randomizer", { defaultValue: "Location Randomizer" })}
							</span>
							<span className="shrink-0 text-sm font-medium tabular-nums text-[var(--text-muted)]">
								{radiusLabel}
							</span>
						</div>
						<p className="mt-0.5 text-xs leading-snug text-[var(--text-muted)]">
							{t("profile_editor.sections.map.location_randomizer_desc", {
								defaultValue: "For your privacy, your location on the map is offset within this range and updates as you move.",
							})}
						</p>
						<Slider
							hideHeader
							min={MAP_FUZZ_RADIUS_MIN}
							max={MAP_FUZZ_RADIUS_MAX}
							step={MAP_FUZZ_RADIUS_STEP}
							defaultValue={settings.mapLocationFuzzRadius ?? MAP_FUZZ_RADIUS_MIN}
							label={t("profile_editor.sections.map.location_randomizer", { defaultValue: "Location Randomizer" })}
							displayValue={radiusLabel}
							onChange={setDraftRadius}
							onCommit={(value) => {
								setDraftRadius(null);
								if (value !== settings.mapLocationFuzzRadius) {
									void update({ mapLocationFuzzRadius: value });
								}
							}}
						/>
					</div>
				</div>
			)}
		</>
	);
}

/** NSFW content row: opting in to explicit images in Right Now (server-side,
 * unlike the blur toggles beside it). Hidden until the settings have loaded. */
export function RightNowExplicitImagesRow({ highlightId }: { highlightId: string | null }) {
	const { t } = useTranslation();
	const { settings, update } = useAccountSettings();
	if (!settings) return null;

	return (
		<ToggleRow
			id="privacy-right-now-explicit-images"
			highlighted={highlightId === "privacy-right-now-explicit-images"}
			icon={<ImagesFilled className="h-5 w-5" />}
			iconClass="bg-purple-500/15 text-purple-400"
			label={t("profile_editor.sections.map.view_right_now_nsfw", { defaultValue: "Explicit Images in Right Now" })}
			description={t("profile_editor.sections.map.view_right_now_nsfw_desc", {
				defaultValue: "Opt in to seeing explicit sexual and other adult content in Right Now.",
			})}
			checked={settings.viewRightNowNsfw}
			onChange={(checked) => void update({ viewRightNowNsfw: checked })}
		/>
	);
}
