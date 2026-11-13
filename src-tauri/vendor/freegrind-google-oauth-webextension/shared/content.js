(() => {
	"use strict";

	const api = typeof browser !== "undefined" ? browser : chrome;
	const RESULT_CHANNEL = "grindr-google-oauth:result";
	const START_CHANNEL = "grindr-google-oauth:start";
	// An app opening the page only to sign in (Free Grind's
	// GoogleOAuthActivity) asks to go straight to Google with this.
	const AUTO_START_HASH = "#autostart";
	const DELIVERY_FAILED = "Couldn't hand the token to the app.";
	const EXTENSION_GONE =
		"The extension was updated or turned off. Reload the page to sign in again.";
	const PAGE_SCRIPTS = ["shared/gis-core.js", "shared/page-runner.js"];

	const injectPageScript = (path) =>
		new Promise((resolve, reject) => {
			const script = document.createElement("script");
			script.src = api.runtime.getURL(path);
			script.onload = () => {
				script.remove();
				resolve();
			};
			script.onerror = () =>
				reject(new Error(`failed to inject ${path}`));
			(document.head || document.documentElement).appendChild(script);
		});

	const injectPageScripts = async () => {
		for (const path of PAGE_SCRIPTS) {
			await injectPageScript(path);
		}
	};

	let mounted = false;
	let handled = false;
	let autoStarted = false;

	const isGeckoViewBuiltIn = () => {
		try {
			return (api.runtime.getManifest().permissions || []).includes(
				"geckoViewAddons",
			);
		} catch {
			return false;
		}
	};

	const isExtensionAlive = () => {
		try {
			return Boolean(api.runtime?.id);
		} catch {
			return false;
		}
	};

	const sendMessage = (message) => {
		try {
			return Promise.resolve(api.runtime.sendMessage(message));
		} catch (error) {
			return Promise.reject(error);
		}
	};

	const isAutoStart = () => location.hash === AUTO_START_HASH;

	const fail = (message) => {
		handled = false;
		window.__grindrOauthUi.reveal();
		window.__grindrOauthUi.setPhase("failed");
		window.__grindrOauthUi.setError(message);
	};

	const handleToken = async (token) => {
		handled = true;
		if (!isGeckoViewBuiltIn()) {
			window.__grindrOauthUi.showToken(token, { focus: true });
			return;
		}
		let delivery;
		try {
			delivery = await sendMessage({ type: "token", token });
		} catch (error) {
			fail(
				isExtensionAlive()
					? String(error?.message || error)
					: EXTENSION_GONE,
			);
			return;
		}
		if (delivery?.delivered) return;
		fail(delivery?.error || DELIVERY_FAILED);
	};

	const showError = (error) => {
		fail(`Sign-in failed: ${error}`);
		reportError(error);
	};

	const reportError = (error) => {
		sendMessage({ type: "error", error }).catch(() => {});
	};

	const isResultMessage = (event) =>
		event.source === window &&
		event.origin === location.origin &&
		event.data?.channel === RESULT_CHANNEL;

	window.addEventListener("message", (event) => {
		if (!mounted || !isResultMessage(event)) return;
		const { phase, token, error } = event.data;
		if (phase) {
			window.__grindrOauthUi.setPhase(phase);
			// Go straight to Google, once, with the card still hidden. Back
			// at "ready" the popup failed to open without a tap: only then
			// show the button as the fallback.
			if (phase === "ready" && isAutoStart()) {
				if (autoStarted) {
					window.__grindrOauthUi.reveal();
				} else {
					autoStarted = true;
					window.postMessage(
						{ channel: START_CHANNEL },
						location.origin,
					);
				}
			}
			return;
		}
		if (handled) return;
		if (token) handleToken(token);
		else if (error) showError(error);
	});

	const runDesktop = async () => {
		mounted = true;
		window.stop();
		const head = document.createElement("head");
		const viewport = document.createElement("meta");
		viewport.name = "viewport";
		viewport.content = "width=device-width, initial-scale=1";
		head.append(viewport);
		document.documentElement.replaceChildren(
			head,
			document.createElement("body"),
		);
		window.__grindrOauthUi.mount({ quiet: isAutoStart() });
		try {
			await injectPageScripts();
		} catch (error) {
			showError(String(error?.message || error));
		}
	};

	const main = async () => {
		if (isGeckoViewBuiltIn()) {
			await runDesktop();
			return;
		}
		let armed = false;
		try {
			armed = Boolean((await sendMessage({ type: "ready" }))?.armed);
		} catch {
			// no receiver; stay disarmed
		}
		if (armed) {
			await runDesktop();
		}
	};

	main();
})();
