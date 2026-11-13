import {
	EXTENSION_ID,
	extensionBaseUrl,
	type Manifest,
	type Target,
	targetFiles,
} from "./extension-files";
import { FakeClock } from "./fake-clock";
import { extensionNamespace, runScript } from "./script-runner";

export type NativeMode =
	"accept" | "accept-null" | "refuse" | "silent" | "throw" | "missing";

export type RuntimeMessage = {
	type?: string;
	token?: string;
	error?: string;
} | null;

export type MessageSender = { tab?: { id: number }; id?: string } | undefined;

type SendResponse = (response: unknown) => void;

type MessageListener = (
	message: unknown,
	sender: MessageSender,
	sendResponse: SendResponse,
) => unknown;

export type Dispatch = {
	returned: unknown;
	replies: unknown[];
	reply: Promise<unknown>;
};

export type NativeCall = {
	app: string;
	payload: RuntimeMessage;
	resolve: (response: unknown) => void;
	reject: (error: unknown) => void;
};

export type ReceivedMessage = {
	message: RuntimeMessage;
	tabId: number | undefined;
};

export type ExtensionOptions = {
	target: Target;
	native?: NativeMode;
	storage?: "as-manifest" | "absent";
};

export const DEFAULT_TAB_ID = 7;

export const fromTab = (id: number): MessageSender => ({ tab: { id } });

const quietConsole = {
	...console,
	error: () => {},
	warn: () => {},
	log: () => {},
};

const backgroundScriptPath = (manifest: Manifest) => {
	const path =
		manifest.background?.service_worker ??
		manifest.background?.scripts?.[0];
	if (!path) throw new Error("the manifest declares no background script");
	return path;
};

export const createExtension = ({
	target,
	native = "accept",
	storage = "as-manifest",
}: ExtensionOptions) => {
	const { manifest, source } = targetFiles(target);
	const backgroundClock = new FakeClock();
	const messageListeners: MessageListener[] = [];
	const tabRemovedListeners: Array<(tabId: number) => void> = [];
	const session = new Map<string, unknown>();
	const nativeCalls: NativeCall[] = [];
	const tabCreates: unknown[] = [];
	const tabUpdates: Array<{ id: number; url: string }> = [];
	const messages: ReceivedMessage[] = [];
	const dispatches: Dispatch[] = [];
	const faults = {
		sessionGetRejects: false,
		getManifestThrows: false,
		native,
	};
	let actionClickListener: (() => Promise<void>) | undefined;
	let nextTabId = DEFAULT_TAB_ID;
	let nativeMessagingLookups = 0;

	const getURL = (path: string) => `${extensionBaseUrl(target)}${path}`;

	const sendNativeMessage = (app: string, payload: RuntimeMessage) => {
		const { promise, resolve, reject } = Promise.withResolvers<unknown>();
		nativeCalls.push({ app, payload, resolve, reject });
		switch (faults.native) {
			case "throw":
				throw new Error("native messaging unavailable");
			case "accept":
				resolve(true);
				break;
			case "accept-null":
				resolve(null);
				break;
			case "refuse":
				reject(new Error("IllegalArgumentException: empty token"));
				break;
			default:
				break;
		}
		return promise;
	};

	const grants = (permission: string) =>
		manifest.permissions?.includes(permission) ?? false;

	const hasNativeMessaging =
		grants("nativeMessaging") && native !== "missing";
	const hasStorage = grants("storage") && storage !== "absent";

	const runtime = {
		id: EXTENSION_ID,
		getManifest: () => {
			if (faults.getManifestThrows) {
				throw new Error("manifest unavailable");
			}
			return manifest;
		},
		getURL,
		onMessage: {
			addListener: (listener: MessageListener) => {
				messageListeners.push(listener);
			},
		},
		get sendNativeMessage() {
			nativeMessagingLookups++;
			return hasNativeMessaging ? sendNativeMessage : undefined;
		},
	};

	const sessionStorage = {
		get: async (key: string) => {
			if (faults.sessionGetRejects) {
				throw new Error("storage.session unavailable");
			}
			return session.has(key)
				? { [key]: structuredClone(session.get(key)) }
				: {};
		},
		set: async (items: Record<string, unknown>) => {
			for (const [key, value] of Object.entries(items)) {
				session.set(key, structuredClone(value));
			}
		},
	};

	const tabs = {
		create: async (properties: unknown) => {
			tabCreates.push(properties);
			return { id: nextTabId };
		},
		update: async (id: number, { url }: { url: string }) => {
			tabUpdates.push({ id, url });
		},
		onRemoved: {
			addListener: (listener: (tabId: number) => void) => {
				tabRemovedListeners.push(listener);
			},
		},
	};

	const actionApi = {
		onClicked: {
			addListener: (listener: () => Promise<void>) => {
				actionClickListener = listener;
			},
		},
	};

	const toolbarButton = () => {
		if (manifest.action) return { action: actionApi };
		if (manifest.browser_action) return { browserAction: actionApi };
		return {};
	};

	const api = {
		runtime,
		...(hasStorage ? { storage: { session: sessionStorage } } : {}),
		tabs,
		...toolbarButton(),
	};

	runScript({
		source: source(backgroundScriptPath(manifest)),
		globals: {
			...extensionNamespace({ target, api }),
			setTimeout: backgroundClock.setTimeout,
			clearTimeout: backgroundClock.clearTimeout,
			console: quietConsole,
		},
	});

	const dispatch = ({
		message,
		sender,
	}: {
		message: unknown;
		sender: MessageSender;
	}): Dispatch => {
		messages.push({
			message: structuredClone(message) as RuntimeMessage,
			tabId: sender?.tab?.id,
		});
		const replies: unknown[] = [];
		const { promise: reply, resolve: settle } =
			Promise.withResolvers<unknown>();
		let returned: unknown;
		for (const listener of messageListeners) {
			const result = listener(message, sender, (response) => {
				replies.push(response);
				settle(response);
			});
			if (result === true) returned = true;
			else if (returned === undefined) returned = result;
		}
		if (returned !== true) settle(undefined);
		const entry = { returned, replies, reply };
		dispatches.push(entry);
		return entry;
	};

	return {
		target,
		manifest,
		backgroundClock,
		faults,
		session,
		nativeCalls,
		tabCreates,
		tabUpdates,
		messages,
		dispatches,
		getURL,
		dispatch,
		get nativeMessagingLookups() {
			return nativeMessagingLookups;
		},
		armTab: async (tabId = DEFAULT_TAB_ID) => {
			if (!actionClickListener) {
				throw new Error(`${target} has no toolbar button listener`);
			}
			nextTabId = tabId;
			await actionClickListener();
		},
		removeTab: (tabId: number) => {
			for (const listener of tabRemovedListeners) listener(tabId);
		},
	};
};

export type Extension = ReturnType<typeof createExtension>;

export const tokenMessages = (extension: Extension) =>
	extension.messages.filter(({ message }) => message?.type === "token");

export const messageTypes = (extension: Extension) =>
	extension.messages.map(({ message }) => message?.type);

export const nativePayloads = (extension: Extension) =>
	extension.nativeCalls.map(({ app, payload }) => ({ app, payload }));
