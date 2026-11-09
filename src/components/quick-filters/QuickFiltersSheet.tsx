import { Check, GripVertical } from "lucide-react";
import { type CSSProperties, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
	DndContext,
	KeyboardSensor,
	PointerSensor,
	closestCenter,
	useSensor,
	useSensors,
	type DragEndEvent,
} from "@dnd-kit/core";
import {
	SortableContext,
	arrayMove,
	sortableKeyboardCoordinates,
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { restrictToVerticalAxis } from "../../utils/dndModifiers";
import { BottomSheet, SHEET_FOOTER_CLASS, SheetClose, SheetCloseButton, sheetButtonClass } from "../ui/bottom-sheet";
import { NATIVE_SHEET_BG } from "../ui/action-sheet";
import type { QuickFilterScope } from "../../config/quick-filters";
import { cn } from "../../utils/cn";
import { useQuickFilterScope } from "./quickFilterDefs";

type QuickFiltersSheetProps = {
	scope: QuickFilterScope;
	onClose: () => void;
	isDesktop: boolean;
	/** Selection color, e.g. Right Now purple or the explore blue; defaults to the accent. */
	accentColor?: string;
	/** Text color on top of `accentColor`. */
	accentContrast?: string;
	/** Opened on top of a filter sheet, so it needs to stack above it. */
	zIndex?: string;
};

/** Lets the user pick which quick filter pills a screen shows above its list,
 * and in which order. Changes save immediately. Pinned filters are listed
 * first in their pill order and can be reordered by their grip; the rest
 * follow below. */
export function QuickFiltersSheet({
	scope,
	onClose,
	isDesktop,
	accentColor = "var(--accent)",
	accentContrast = "var(--accent-contrast)",
	zIndex = "z-[70]",
}: QuickFiltersSheetProps) {
	const { t } = useTranslation();
	const { allKeys, defaults, defs, pinned, save } = useQuickFilterScope(scope);
	const unpinned = allKeys.filter((key) => !pinned.includes(key));

	const toggle = (key: string) =>
		save(pinned.includes(key) ? pinned.filter((k) => k !== key) : [...pinned, key]);

	const sensors = useSensors(
		// The grip is a dedicated handle, so a few pixels are enough to start.
		useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
		useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
	);

	const handleDragEnd = ({ active, over }: DragEndEvent) => {
		if (!over || active.id === over.id) return;
		const from = pinned.indexOf(String(active.id));
		const to = pinned.indexOf(String(over.id));
		if (from < 0 || to < 0) return;
		save(arrayMove(pinned, from, to));
	};

	const isDefault = pinned.length === defaults.length && pinned.every((key, i) => key === defaults[i]);

	const renderRowContent = (key: string, selected: boolean) => {
		const def = defs[key];
		return (
			<button
				type="button"
				role="checkbox"
				aria-checked={selected}
				onClick={() => toggle(key)}
				className="flex min-w-0 flex-1 items-center gap-3 px-3 py-3 text-left"
			>
				<span
					className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors"
					style={{
						borderColor: selected ? accentColor : "var(--border)",
						background: selected ? accentColor : "transparent",
					}}
				>
					{selected && <Check className="h-3 w-3" strokeWidth={3} style={{ color: accentContrast }} />}
				</span>
				<span className={cn("flex shrink-0 items-center justify-center rounded-2xl p-2.5", def.iconClassName)}>
					<span className="flex h-5 w-5 items-center justify-center">{def.renderIcon("h-5 w-5")}</span>
				</span>
				<span className="min-w-0 flex-1">
					<span className="block truncate text-sm font-semibold leading-snug text-[var(--text)]">{def.label}</span>
					{def.hiddenWhileExploring && (
						<span className="mt-0.5 block text-xs leading-snug text-[var(--text-muted)]">
							{t("customizability.quick_filters_explore_hint")}
						</span>
					)}
				</span>
			</button>
		);
	};

	return (
		<BottomSheet
			onClose={onClose}
			isDesktop={isDesktop}
			zIndex={zIndex}
			bg={NATIVE_SHEET_BG}
			panelClassName={isDesktop ? "max-h-[82dvh] px-4" : "max-h-[85dvh] px-4"}
		>
			<div className="mb-2 flex items-center justify-between gap-3">
				<div className="min-w-0">
					<h3 className="truncate text-sm font-semibold text-[var(--text)]">{t("customizability.quick_filters")}</h3>
					<p className="mt-0.5 text-xs leading-snug text-[var(--text-muted)]">{t("customizability.quick_filters_desc")}</p>
				</div>
				<SheetCloseButton />
			</div>
			<div className="-mx-1 min-h-0 flex-1 space-y-1 overflow-y-auto overflow-x-hidden pb-2" data-lenis-prevent>
				<DndContext
					sensors={sensors}
					collisionDetection={closestCenter}
					modifiers={[restrictToVerticalAxis]}
					autoScroll={{ threshold: { x: 0, y: 0.2 } }}
					onDragEnd={handleDragEnd}
				>
					<SortableContext items={pinned} strategy={verticalListSortingStrategy}>
						{pinned.map((key) => (
							<SortableQuickFilterRow
								key={key}
								id={key}
								accentColor={accentColor}
								dragLabel={t("customizability.quick_filters_reorder")}
							>
								{renderRowContent(key, true)}
							</SortableQuickFilterRow>
						))}
					</SortableContext>
				</DndContext>
				{pinned.length > 0 && unpinned.length > 0 && <div className="mx-3 my-2 h-px bg-[var(--border)]" />}
				{unpinned.map((key) => (
					<div key={key} className="flex items-center rounded-2xl transition hover-fill">
						{renderRowContent(key, false)}
					</div>
				))}
			</div>
			<div className={SHEET_FOOTER_CLASS}>
				<button
					type="button"
					disabled={isDefault}
					onClick={() => save([...defaults])}
					className={sheetButtonClass("secondary")}
				>
					{t("customizability.quick_filters_reset")}
				</button>
				<SheetClose
					className={sheetButtonClass("primary")}
					style={{ backgroundColor: accentColor, color: accentContrast }}
				>
					{t("common.done")}
				</SheetClose>
			</div>
		</BottomSheet>
	);
}

/** A pinned filter row, reordered by dragging its grip. */
function SortableQuickFilterRow({
	id,
	accentColor,
	dragLabel,
	children,
}: {
	id: string;
	accentColor: string;
	dragLabel: string;
	children: ReactNode;
}) {
	const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id });
	const style: CSSProperties = {
		transform: CSS.Translate.toString(transform),
		transition,
		background: `color-mix(in srgb, ${accentColor} 12%, var(--sheet-bg, var(--surface)))`,
	};
	return (
		<div
			ref={setNodeRef}
			style={style}
			className={cn("relative flex items-center gap-1 rounded-2xl pr-1.5", isDragging && "z-10 shadow-lg shadow-black/25")}
		>
			{children}
			<button
				ref={setActivatorNodeRef}
				type="button"
				aria-label={dragLabel}
				title={dragLabel}
				{...attributes}
				{...listeners}
				// The sheet leaves touches on this element alone, so dragging the
				// grip down reorders instead of pulling the sheet closed.
				data-sheet-no-drag
				className="flex h-10 w-9 shrink-0 cursor-grab touch-none items-center justify-center rounded-full text-[var(--text-muted)] transition hover:text-[var(--text)] active:cursor-grabbing"
			>
				<GripVertical className="h-5 w-5" />
			</button>
		</div>
	);
}
