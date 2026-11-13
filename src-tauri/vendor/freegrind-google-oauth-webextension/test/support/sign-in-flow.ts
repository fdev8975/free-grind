import type { Target } from "./extension-files";
import {
	createExtension,
	DEFAULT_TAB_ID,
	type ExtensionOptions,
} from "./fake-background";
import { openTab, type TabOptions } from "./sign-in-tab";

type Closable = { close: () => Promise<void> };

const openPages: Closable[] = [];

export const track = <Page extends Closable>(page: Page) => {
	openPages.push(page);
	return page;
};

export const closeOpenPages = async () => {
	for (const page of openPages.splice(0).reverse()) await page.close();
};

export type SignInOptions = Omit<ExtensionOptions, "target"> &
	TabOptions & { arm?: boolean };

export const openSignIn = async (
	target: Target,
	{ native, storage, arm = true, ...tabOptions }: SignInOptions = {},
) => {
	const extension = createExtension({ target, native, storage });
	if (arm && target !== "geckoview") {
		await extension.armTab(tabOptions.tabId ?? DEFAULT_TAB_ID);
	}
	const tab = track(openTab(extension, tabOptions));
	return { extension, tab };
};

export const readySignIn = async (
	target: Target,
	options: SignInOptions = {},
) => {
	const opened = await openSignIn(target, options);
	await opened.tab.whenReady();
	return opened;
};
