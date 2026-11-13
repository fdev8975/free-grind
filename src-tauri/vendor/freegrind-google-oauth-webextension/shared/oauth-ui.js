(() => {
	"use strict";

	if (window.__grindrOauthUi) return;

	const COPIED_RESET_MS = 2500;

	let cardEl = null;
	let buttonEl = null;
	let errorEl = null;

	const element = (tag, className, text) => {
		const el = document.createElement(tag);
		el.className = className;
		if (text !== undefined) el.textContent = text;
		return el;
	};

	// quiet: keep the card hidden until reveal(), for a sign-in that starts
	// on its own and only needs the button as a fallback.
	const mount = ({ quiet = false } = {}) => {
		document.documentElement.classList.add("grindr-oauth-active");

		const overlay = element("div", "grindr-oauth-overlay");
		cardEl = element("div", "grindr-oauth-card");
		cardEl.hidden = quiet;

		buttonEl = element("button", "grindr-oauth-button", "Loading...");
		buttonEl.type = "button";
		buttonEl.disabled = true;

		errorEl = element("p", "grindr-oauth-error");
		errorEl.setAttribute("role", "alert");
		errorEl.hidden = true;

		cardEl.append(buttonEl, errorEl);
		overlay.append(cardEl);
		document.documentElement.append(overlay);
	};

	const reveal = () => {
		if (cardEl) cardEl.hidden = false;
	};

	const setError = (message) => {
		if (!errorEl) return;
		errorEl.textContent = message || "";
		errorEl.hidden = !message;
	};

	const setPhase = (phase) => {
		if (!buttonEl) return;
		if (phase !== "failed") setError("");
		if (phase === "loading") {
			buttonEl.disabled = true;
			buttonEl.textContent = "Loading...";
		} else if (phase === "ready") {
			buttonEl.disabled = false;
			buttonEl.textContent = "Sign in with Google";
			buttonEl.focus();
		} else if (phase === "signing-in") {
			buttonEl.disabled = true;
			buttonEl.textContent = "Signing in with Google...";
		} else if (phase === "failed") {
			buttonEl.disabled = false;
			buttonEl.textContent = "Try again";
		}
	};

	const selectContents = (node) => {
		const range = document.createRange();
		range.selectNodeContents(node);
		const selection = getSelection();
		selection.removeAllRanges();
		selection.addRange(range);
	};

	const copyFromSelection = (node) => {
		selectContents(node);
		try {
			return document.execCommand("copy");
		} catch {
			return false;
		}
	};

	const showTokenCard = (children) => {
		if (!cardEl) mount();
		reveal();
		buttonEl = null;
		errorEl = null;
		cardEl.classList.add("grindr-oauth-token-card");
		cardEl.replaceChildren(...children);
	};

	const showMissingToken = () => {
		showTokenCard([
			element("h1", "grindr-oauth-token-title", "No token here"),
			element("p", "grindr-oauth-token-status", "Run the sign-in again."),
		]);
	};

	const showToken = (token, { focus = false } = {}) => {
		if (!token) {
			showMissingToken();
			return;
		}

		const field = element("p", "grindr-oauth-token", token);
		const copyButton = element(
			"button",
			"grindr-oauth-token-copy",
			"Copy token",
		);
		copyButton.type = "button";
		const status = element("p", "grindr-oauth-token-status");
		status.setAttribute("role", "status");
		const note = element("p", "grindr-oauth-token-note");
		note.append(
			"Paste it into ",
			element("strong", "", "Free Grind"),
			". Don't share it publicly. The token expires in about an hour.",
		);

		let resetTimer = 0;

		const onCopied = () => {
			clearTimeout(resetTimer);
			status.classList.remove("is-error");
			copyButton.textContent = "Copied";
			status.textContent = "Full token copied to your clipboard.";
			resetTimer = setTimeout(() => {
				copyButton.textContent = "Copy token";
			}, COPIED_RESET_MS);
		};

		const onCopyFailed = () => {
			clearTimeout(resetTimer);
			copyButton.textContent = "Copy token";
			status.classList.add("is-error");
			status.textContent =
				"Couldn't reach the clipboard. Tap the token, then copy it.";
			selectContents(field);
		};

		const settle = (copied) => (copied ? onCopied() : onCopyFailed());

		copyButton.addEventListener("click", () => {
			if (!navigator.clipboard?.writeText) {
				settle(copyFromSelection(field));
				return;
			}
			navigator.clipboard
				.writeText(token)
				.then(onCopied, () => settle(copyFromSelection(field)));
		});

		showTokenCard([
			element(
				"h1",
				"grindr-oauth-token-title",
				"Your Google sign-in token",
			),
			field,
			copyButton,
			status,
			note,
		]);
		if (focus) copyButton.focus();
		window.addEventListener(
			"pagehide",
			() => {
				clearTimeout(resetTimer);
				showMissingToken();
			},
			{ once: true },
		);
	};

	window.__grindrOauthUi = { mount, reveal, setError, setPhase, showToken };
})();
