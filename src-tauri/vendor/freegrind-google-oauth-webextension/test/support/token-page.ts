import { extensionBaseUrl, type Target, targetFiles } from "./extension-files";
import { FakeClock } from "./fake-clock";
import { pageUi } from "./page-ui";
import {
	type ClipboardOptions,
	closeWindowOnce,
	createPageWindow,
	installClipboard,
	selectedText,
} from "./page-window";
import { runScript } from "./script-runner";

export type TokenPageOptions = ClipboardOptions & {
	hash: string | null;
	replaceStateThrows?: boolean;
};

type ReplaceStateArguments = [state: unknown, unused: string, url?: string];

export const openTokenPage = (
	target: Target,
	{ hash, replaceStateThrows = false, ...clipboardOptions }: TokenPageOptions,
) => {
	const files = targetFiles(target);
	const pageUrl = `${extensionBaseUrl(target)}shared/token.html`;
	const window = createPageWindow(
		hash === null ? pageUrl : `${pageUrl}#${hash}`,
	);
	const document = window.document;
	const parsed = new window.DOMParser().parseFromString(
		files.source("shared/token.html"),
		"text/html",
	);
	const scriptElements = [...parsed.querySelectorAll("script")];
	const scripts = scriptElements.map((script) => script.getAttribute("src"));
	const stylesheets = [
		...parsed.querySelectorAll('link[rel="stylesheet"]'),
	].map((link) => link.getAttribute("href"));
	const references = [...parsed.querySelectorAll("[src], [href]")].map(
		(element) =>
			element.getAttribute("src") ?? element.getAttribute("href"),
	);
	const inlineStyles = parsed.querySelectorAll("style").length;
	for (const script of scriptElements) script.remove();
	document.documentElement.innerHTML = parsed.documentElement.innerHTML;

	const uiClock = new FakeClock();
	const clipboard = installClipboard(window, clipboardOptions);
	const replaceCalls: ReplaceStateArguments[] = [];
	const history = {
		get length() {
			return window.history.length;
		},
		replaceState: (...call: ReplaceStateArguments) => {
			replaceCalls.push(call);
			if (replaceStateThrows) throw new Error("SecurityError");
			window.history.replaceState(...call);
		},
	};
	const globals = {
		window,
		document,
		location: window.location,
		history,
		navigator: clipboard.navigator,
		getSelection: () => window.getSelection(),
		setTimeout: uiClock.setTimeout,
		clearTimeout: uiClock.clearTimeout,
	};
	for (const src of scripts) {
		if (src === null) {
			throw new Error(
				"token.html has an inline script the harness can't run",
			);
		}
		runScript({ source: files.source(`shared/${src}`), globals });
	}

	return {
		window,
		document,
		uiClock,
		scripts,
		stylesheets,
		references,
		inlineStyles,
		replaceCalls,
		clipboard,
		ui: pageUi(window),
		html: () => document.documentElement.outerHTML,
		selection: () => selectedText(window),
		pagehide: () => window.dispatchEvent(new window.Event("pagehide")),
		close: closeWindowOnce(window),
	};
};

export type TokenPage = ReturnType<typeof openTokenPage>;
