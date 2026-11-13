import { useRef, type MouseEvent, type PointerEvent } from "react";
import { haptic } from "../../../../utils/haptics";

const LONG_PRESS_MS = 450;
const LONG_PRESS_MOVE_TOLERANCE_PX = 10;
// A touch that lands while the grid is still scrolling (momentum after a
// fling) just stops the scroll — holding that finger still must not count as
// a long press on whatever tile ended up underneath.
const SCROLL_SETTLE_MS = 120;

// Last time anything scrolled. Scroll events don't bubble, so listen in the
// capture phase to catch the grid's inner scroll container too.
let lastScrollAt = 0;
if (typeof window !== "undefined") {
	window.addEventListener("scroll", () => { lastScrollAt = performance.now(); }, { capture: true, passive: true });
}

/**
 * Opens a profile tile's/row's context menu: long press on touch, right-click
 * on mouse (browse grid, Interest grid and list). The press is cancelled as
 * soon as the finger drifts (i.e. the user is scrolling), and the click that
 * follows a fired long press should be swallowed — `consumeLongPress()` in
 * the click handler says so — so the profile doesn't open under the menu.
 * Without `onOpenMenu`, the handlers do nothing.
 */
export function useTileMenuPress(onOpenMenu: ((x: number, y: number) => void) | null | undefined) {
	const pressRef = useRef<{ timer: ReturnType<typeof setTimeout>; x: number; y: number } | null>(null);
	const longPressTriggeredRef = useRef(false);
	// Defaults to "mouse" so keyboard-triggered context menus still work.
	const lastPointerTypeRef = useRef<string>("mouse");
	const onOpenMenuRef = useRef(onOpenMenu);
	onOpenMenuRef.current = onOpenMenu;

	const cancelPress = () => {
		if (pressRef.current) {
			clearTimeout(pressRef.current.timer);
			pressRef.current = null;
		}
	};

	const onPointerDown = (event: PointerEvent) => {
		longPressTriggeredRef.current = false;
		lastPointerTypeRef.current = event.pointerType;
		cancelPress();
		if (!onOpenMenuRef.current || event.pointerType === "mouse") return;
		const startedAt = performance.now();
		if (startedAt - lastScrollAt < SCROLL_SETTLE_MS) return;
		const { clientX: x, clientY: y } = event;
		pressRef.current = {
			x,
			y,
			timer: setTimeout(() => {
				pressRef.current = null;
				// The list scrolled during the hold (the browser doesn't always
				// send pointercancel/pointermove for it) — this was a scroll.
				if (lastScrollAt >= startedAt) return;
				longPressTriggeredRef.current = true;
				haptic(15);
				onOpenMenuRef.current?.(x, y);
			}, LONG_PRESS_MS),
		};
	};

	const onPointerMove = (event: PointerEvent) => {
		const press = pressRef.current;
		if (!press) return;
		if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > LONG_PRESS_MOVE_TOLERANCE_PX) {
			cancelPress();
		}
	};

	const onContextMenu = (event: MouseEvent) => {
		event.preventDefault();
		// Android WebViews also fire contextmenu on a touch long press — the
		// timer above owns that case.
		// Checking the pointer type (not just pressRef) matters: a press skipped
		// because the list was still scrolling has no pressRef either.
		if (!onOpenMenuRef.current || lastPointerTypeRef.current !== "mouse" || pressRef.current || longPressTriggeredRef.current) return;
		onOpenMenuRef.current(event.clientX, event.clientY);
	};

	/** True once after a long press opened the menu: the click that follows should do nothing. */
	const consumeLongPress = () => {
		if (!longPressTriggeredRef.current) return false;
		longPressTriggeredRef.current = false;
		return true;
	};

	return {
		pressHandlers: {
			onPointerDown,
			onPointerMove,
			onPointerUp: cancelPress,
			onPointerCancel: cancelPress,
			onPointerLeave: cancelPress,
			onContextMenu,
		},
		consumeLongPress,
	};
}
