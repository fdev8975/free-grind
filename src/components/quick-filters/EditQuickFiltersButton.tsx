import { useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Settings } from "lucide-react";
import { useDesktopBreakpoint } from "../../hooks/useDesktopBreakpoint";
import { SHEET_ICON_BUTTON_CLASS } from "../ui/bottom-sheet";
import type { QuickFilterScope } from "../../config/quick-filters";
import { QuickFiltersSheet } from "./QuickFiltersSheet";

/** Header button of a filter sheet (next to its close button) that opens the
 * quick filter editor on top of it. */
export function EditQuickFiltersButton({
	scope,
	accentColor,
	accentContrast,
}: {
	scope: QuickFilterScope;
	accentColor?: string;
	accentContrast?: string;
}) {
	const { t } = useTranslation();
	const isDesktop = useDesktopBreakpoint();
	const [isOpen, setIsOpen] = useState(false);
	const label = t("customizability.quick_filters_edit");

	return (
		<>
			<button
				type="button"
				onClick={() => setIsOpen(true)}
				aria-label={label}
				title={label}
				className={SHEET_ICON_BUTTON_CLASS}
			>
				<Settings className="h-4 w-4" strokeWidth={2.5} />
			</button>
			{isOpen && createPortal(
				<QuickFiltersSheet
					scope={scope}
					onClose={() => setIsOpen(false)}
					isDesktop={isDesktop}
					accentColor={accentColor}
					accentContrast={accentContrast}
				/>,
				document.body,
			)}
		</>
	);
}
