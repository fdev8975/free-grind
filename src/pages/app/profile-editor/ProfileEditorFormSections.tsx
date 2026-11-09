import { useMemo, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import {
	AlertTriangle,
	AlignLeft,
	Bell,
	Cake,
	Calendar,
	ChevronRight,
	Compass,
	Eye,
	Flame,
	Globe,
	Hash,
	Heart,
	MapPin,
	MessageSquare,
	Ruler,
	Scale,
	Search,
	Shield,
	ShieldCheck,
	Syringe,
	Tag,
	User,
	UserRound,
	type LucideIcon,
} from "lucide-react";
import { usePreferences } from "../../../contexts/PreferencesContext";
import { useDesktopBreakpoint } from "../../../hooks/useDesktopBreakpoint";
import { sheetChipClassName } from "../../../components/ui/sheet-section";
import { cn } from "../../../utils/cn";
import { SelectSheet } from "../../../components/ui/select-sheet";
import { TravelPlansSection } from "./TravelPlansSection";
import { SpotifyFavoritesSection } from "./SpotifyFavoritesSection";
import { TagsPickerDialog } from "./TagsPickerDialog";
import {
	FieldSection,
	FIELD_ROW_HOVER_CLASS,
	MultiSelectField,
	PickerRow,
	SingleSelectField,
	TextAreaField,
	TextField,
	ToggleField,
} from "./ProfileFieldRows";
import { SEXUAL_POSITION_ICONS } from "../profile-option-builders";
import { FacebookIcon, InstagramIcon, XIcon } from "../../../components/icons/BrandIcons";
import {
	MAX_PROFILE_TAGS,
	toggleProfileTagText,
} from "./profileEditorUtils";
import type { ProfileEditorState } from "./useProfileEditor";

export type ToggleMultiValueKey =
	| "lookingFor"
	| "meetAt"
	| "grindrTribes"
	| "tribesImInto"
	| "genders"
	| "pronouns"
	| "sexualHealth"
	| "vaccines";

const TEST_REMINDER_THRESHOLD_MONTHS = 3;
const LAST_TESTED_MONTH_RANGE = 24;

/** "Last tested" as a row opening a month list (the last 24 months, so no
 * future dates); draft value is "YYYY-MM", "" for not set. */
function LastTestedField({
	icon,
	label,
	value,
	onChange,
}: {
	icon?: LucideIcon;
	label: string;
	value: string;
	onChange: (value: string) => void;
}) {
	const { t, i18n } = useTranslation();
	const isDesktop = useDesktopBreakpoint();
	const [isOpen, setIsOpen] = useState(false);

	const options = useMemo(() => {
		const formatter = new Intl.DateTimeFormat(i18n.language, { month: "long", year: "numeric", timeZone: "UTC" });
		const now = new Date();
		const months = Array.from({ length: LAST_TESTED_MONTH_RANGE }, (_, i) => {
			const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
			return {
				value: `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`,
				label: formatter.format(date),
			};
		});
		// Keep an older saved month listed, so it still shows as selected.
		if (value && !months.some((month) => month.value === value)) {
			const [year, month] = value.split("-").map(Number);
			if (year && month) {
				months.push({ value, label: formatter.format(new Date(Date.UTC(year, month - 1, 1))) });
			}
		}
		return months;
	}, [i18n.language, value]);

	return (
		<>
			<PickerRow
				icon={icon}
				label={label}
				value={options.find((option) => option.value === value)?.label ?? ""}
				onClick={() => setIsOpen(true)}
			/>
			{isOpen && createPortal(
				<SelectSheet
					title={label}
					value={value}
					options={[{ value: "", label: t("profile_editor.sections.states.not_set") }, ...options]}
					onSelect={onChange}
					onClose={() => setIsOpen(false)}
					isDesktop={isDesktop}
					expandable
					closeLabel={t("common.cancel", { defaultValue: "Cancel" })}
				/>,
				document.body,
			)}
		</>
	);
}

export function ProfileEditorFormSections({ editor }: { editor: ProfileEditorState }) {
	const { t } = useTranslation();
	const { testReminderDisabled, setPreferences } = usePreferences();
	const {
		draft,
		unitsPreset,
		handleDraftChange: onDraftChange,
		toggleMultiValue: onToggleMultiValue,
		displayNameError,
		aboutMeError,
		tagsError,
		tagList,
		tagLabelByKey,
		options,
		profileId,
		spotifyTracks,
		isLoadingSpotify,
		setSpotifyDraft,
		travelPlans,
		isLoadingTravelPlans,
		setTravelDraft,
	} = editor;
	const isImperialHeight = unitsPreset === "uk" || unitsPreset === "american";
	const isImperialWeight = unitsPreset === "american";
	const [isTagsDialogOpen, setIsTagsDialogOpen] = useState(false);

	const monthsSinceLastTested = useMemo(() => {
		if (!draft.lastTestedDate) return null;
		const timestamp = new Date(draft.lastTestedDate).getTime();
		if (Number.isNaN(timestamp)) return null;
		return (Date.now() - timestamp) / (1000 * 60 * 60 * 24 * 30.44);
	}, [draft.lastTestedDate]);

	const isTestOverdue =
		monthsSinceLastTested != null && monthsSinceLastTested >= TEST_REMINDER_THRESHOLD_MONTHS;

	const PositionIcon = (draft.sexualPosition ? SEXUAL_POSITION_ICONS[Number(draft.sexualPosition)] : undefined) ?? Compass;

	// The sections below use the profile view's headings and field icons, so
	// editing reads like the profile it changes. Order follows it too (Expectations,
	// Health | Stats, Trips, Social, songs, account), except About comes before
	// Tags, so name and bio lead.
	const tagsSection = (
		<FieldSection title={t("profile_details.tags")}>
			{/* The picks as chips; editing happens in the picker. */}
			<button
				type="button"
				onClick={() => setIsTagsDialogOpen(true)}
				className={`block w-full px-4 py-3 text-start transition ${FIELD_ROW_HOVER_CLASS}`}
			>
				<span className="flex min-h-6 items-center gap-3">
					<Tag className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
					<span className="flex-1 text-sm font-medium text-[var(--text)]">
						{t("profile_editor.sections.profile.my_tags")}
					</span>
					<span className="text-xs tabular-nums text-[var(--text-muted)] opacity-70">
						{tagList.length}/{MAX_PROFILE_TAGS}
					</span>
					<ChevronRight className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
				</span>
				{tagList.length > 0 ? (
					<span
						className="mt-2 flex flex-wrap gap-1.5"
						style={{ "--chip-accent": "var(--accent)" } as CSSProperties}
					>
						{tagList.map((tag) => (
							<span key={tag} className={cn(sheetChipClassName({ active: false, size: "sm" }), "text-[var(--text)]")}>
								{tagLabelByKey.get(tag) ?? tag}
							</span>
						))}
					</span>
				) : (
					<span className="mt-1 block ps-7 text-sm text-[var(--text-muted)] opacity-60">
						{t("profile_editor.sections.profile.no_tags_added")}
					</span>
				)}
				{tagsError && <span className="mt-1.5 block text-xs text-red-400">{tagsError}</span>}
			</button>
		</FieldSection>
	);

	const aboutSection = (
		<FieldSection title={t("profile_details.about")}>
			<TextField
				icon={UserRound}
				label={t("profile_editor.sections.profile.display_name")}
				value={draft.displayName}
				onChange={(value) => onDraftChange("displayName", value)}
				placeholder={t("profile_editor.sections.profile.display_name_placeholder")}
				maxLength={15}
				counter={`${draft.displayName.trim().length}/15`}
				error={displayNameError}
			/>
			<TextAreaField
				icon={AlignLeft}
				label={t("profile_editor.sections.profile.about_me")}
				value={draft.aboutMe}
				onChange={(value) => onDraftChange("aboutMe", value)}
				placeholder={t("profile_editor.sections.profile.about_me_placeholder")}
				maxLength={255}
				counter={`${draft.aboutMe.length}/255`}
				error={aboutMeError}
			/>
		</FieldSection>
	);

	const expectationsSection = (
		<FieldSection title={t("profile_details.expectations")}>
			<MultiSelectField
				icon={Search}
				label={t("profile_editor.sections.expectations.looking_for")}
				values={draft.lookingFor}
				options={options.lookingFor}
				onToggle={(value) => onToggleMultiValue("lookingFor", value)}
			/>
			<MultiSelectField
				icon={MapPin}
				label={t("profile_editor.sections.expectations.meet_at")}
				values={draft.meetAt}
				options={options.meetAt}
				onToggle={(value) => onToggleMultiValue("meetAt", value)}
			/>
			<SingleSelectField
				icon={Shield}
				label={t("profile_editor.sections.expectations.accept_nsfw")}
				value={draft.nsfw}
				options={options.nsfw}
				onChange={(value) => onDraftChange("nsfw", value)}
			/>
			<ToggleField
				icon={Eye}
				label={t("profile_editor.sections.states.show_tribes")}
				checked={draft.showTribes}
				onChange={(checked) => onDraftChange("showTribes", checked)}
			/>
			<MultiSelectField
				icon={Flame}
				label={t("profile_editor.sections.states.tribes")}
				values={draft.grindrTribes}
				options={options.tribe}
				onToggle={(value) => onToggleMultiValue("grindrTribes", value)}
			/>
			<MultiSelectField
				icon={Flame}
				label={t("profile_editor.sections.states.tribes_im_into")}
				values={draft.tribesImInto}
				options={options.tribe}
				onToggle={(value) => onToggleMultiValue("tribesImInto", value)}
			/>
			<MultiSelectField
				icon={User}
				label={t("profile_editor.sections.identity.gender")}
				values={draft.genders}
				// Primary genders first, like the official picker.
				options={[
					...options.gender.filter((option) => options.defaultGenderIds.includes(option.value)),
					...options.gender.filter((option) => !options.defaultGenderIds.includes(option.value)),
				]}
				onToggle={(value) => onToggleMultiValue("genders", value)}
				search={{
					placeholder: t("profile_editor.sections.identity.gender_search_placeholder"),
					noMatchesLabel: t("profile_editor.sections.identity.gender_no_matches"),
				}}
				unavailableLabel={t("profile_editor.sections.identity.gender_unavailable")}
			/>
			<MultiSelectField
				icon={MessageSquare}
				label={t("profile_editor.sections.identity.pronouns")}
				values={draft.pronouns}
				options={options.pronoun}
				onToggle={(value) => onToggleMultiValue("pronouns", value)}
				unavailableLabel={t("profile_editor.sections.identity.pronouns_unavailable")}
			/>
		</FieldSection>
	);

	const healthSection = (
		<FieldSection title={t("profile_details.health")}>
			<SingleSelectField
				icon={Shield}
				label={t("profile_editor.sections.health.hiv_status")}
				value={draft.hivStatus}
				options={options.hivStatus}
				onChange={(value) => onDraftChange("hivStatus", value)}
			/>
			<LastTestedField
				icon={Calendar}
				label={t("profile_editor.sections.health.last_tested")}
				value={draft.lastTestedDate}
				onChange={(value) => onDraftChange("lastTestedDate", value)}
			/>
			{isTestOverdue && (
				<div className="flex items-start gap-3 bg-amber-500/10 px-4 py-3">
					<AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
					<p className="text-xs leading-relaxed text-amber-400">
						{t("profile_editor.sections.health.test_reminder")}
					</p>
				</div>
			)}
			<ToggleField
				icon={Bell}
				label={t("profile_editor.sections.health.test_reminder_toggle")}
				description={t("profile_editor.sections.health.test_reminder_toggle_desc")}
				checked={!testReminderDisabled}
				onChange={(checked) => void setPreferences({ testReminderDisabled: !checked })}
			/>
			<MultiSelectField
				icon={ShieldCheck}
				label={t("profile_editor.sections.health.health_practices")}
				values={draft.sexualHealth}
				options={options.sexualHealth}
				onToggle={(value) => onToggleMultiValue("sexualHealth", value)}
			/>
			<MultiSelectField
				icon={Syringe}
				label={t("profile_editor.sections.health.vaccinations")}
				values={draft.vaccines}
				options={options.vaccine}
				onToggle={(value) => onToggleMultiValue("vaccines", value)}
			/>
		</FieldSection>
	);

	const statsSection = (
		<FieldSection title={t("profile_details.stats")}>
			<ToggleField
				icon={Eye}
				label={t("profile_editor.sections.states.show_age")}
				checked={draft.showAge}
				onChange={(checked) => onDraftChange("showAge", checked)}
			/>
			<TextField
				icon={Cake}
				label={t("profile_editor.sections.states.age")}
				value={draft.age}
				onChange={(value) => onDraftChange("age", value)}
				placeholder="—"
				numeric
			/>
			<ToggleField
				icon={Eye}
				label={t("profile_editor.sections.states.show_position")}
				checked={draft.showPosition}
				onChange={(checked) => onDraftChange("showPosition", checked)}
			/>
			<SingleSelectField
				icon={PositionIcon}
				label={t("profile_editor.sections.states.position")}
				value={draft.sexualPosition}
				options={options.position}
				optionIcons={SEXUAL_POSITION_ICONS}
				onChange={(value) => onDraftChange("sexualPosition", value)}
			/>
			<TextField
				icon={Ruler}
				label={t("profile_editor.sections.states.height")}
				value={draft.height}
				onChange={(value) => onDraftChange("height", value)}
				placeholder={t(
					isImperialHeight
						? "profile_editor.sections.states.height_placeholder_in"
						: "profile_editor.sections.states.height_placeholder",
				)}
				numeric
			/>
			<TextField
				icon={Scale}
				label={t("profile_editor.sections.states.weight")}
				value={draft.weight}
				onChange={(value) => onDraftChange("weight", value)}
				placeholder={t(
					isImperialWeight
						? "profile_editor.sections.states.weight_placeholder_lb"
						: "profile_editor.sections.states.weight_placeholder",
				)}
				numeric
			/>
			<SingleSelectField
				icon={User}
				label={t("profile_editor.sections.states.body_type")}
				value={draft.bodyType}
				options={options.bodyType}
				onChange={(value) => onDraftChange("bodyType", value)}
			/>
			<SingleSelectField
				icon={Globe}
				label={t("profile_editor.sections.states.ethnicity")}
				value={draft.ethnicity}
				options={options.ethnicity}
				onChange={(value) => onDraftChange("ethnicity", value)}
			/>
			<SingleSelectField
				icon={Heart}
				label={t("profile_editor.sections.states.relationship_status")}
				value={draft.relationshipStatus}
				options={options.relationshipStatus}
				onChange={(value) => onDraftChange("relationshipStatus", value)}
			/>
		</FieldSection>
	);

	const socialSection = (
		<FieldSection title={t("profile_details.social")}>
			{([
				["instagram", InstagramIcon],
				["twitter", XIcon],
				["facebook", FacebookIcon],
			] as const).map(([network, NetworkIcon]) => (
				<TextField
					key={network}
					icon={NetworkIcon}
					label={t("profile_editor.sections.social.username")}
					value={draft[network]}
					onChange={(value) => onDraftChange(network, value)}
					placeholder={t(`profile_editor.sections.social.${network}`)}
				/>
			))}
		</FieldSection>
	);

	const accountSection = (
		<FieldSection title={t("profile_details.account_info")}>
			<div className="flex min-h-12 items-center gap-3 px-4 py-2.5">
				<Hash className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
				<span className="flex-1 text-sm font-medium text-[var(--text)]">
					{t("profile_editor.sections.other.user_id")}
				</span>
				<span className="select-text font-mono text-sm text-[var(--text-muted)]">
					{profileId ?? "—"}
				</span>
			</div>
		</FieldSection>
	);

	const firstStack = (
		<>
			{aboutSection}
			{tagsSection}
			{expectationsSection}
			{healthSection}
		</>
	);
	const secondStack = (
		<>
			{statsSection}
			<TravelPlansSection
				plans={travelPlans}
				isLoading={isLoadingTravelPlans}
				disabled={profileId == null}
				onChange={setTravelDraft}
			/>
			{socialSection}
			<SpotifyFavoritesSection
				tracks={spotifyTracks}
				isLoading={isLoadingSpotify}
				disabled={profileId == null}
				onChange={setSpotifyDraft}
			/>
			{accountSection}
		</>
	);

	return (
		<>
			{/* Same spacing and side inset as the profile view's sections. */}
			<div className="grid gap-8 px-3">
				{firstStack}
				{secondStack}
			</div>

			{/* Portaled like the row pickers: inside the editor panel the sheet was
			    laid out within the profile column on desktop, not over the page. */}
			{isTagsDialogOpen && createPortal(
				<TagsPickerDialog
					selected={tagList}
					max={MAX_PROFILE_TAGS}
					maxMessage={t("profile_editor.errors.max_selection", { count: MAX_PROFILE_TAGS })}
					onToggle={(tagKey) => onDraftChange("profileTagsText", toggleProfileTagText(draft.profileTagsText, tagKey))}
					onClose={() => setIsTagsDialogOpen(false)}
				/>,
				document.body,
			)}
		</>
	);
}
