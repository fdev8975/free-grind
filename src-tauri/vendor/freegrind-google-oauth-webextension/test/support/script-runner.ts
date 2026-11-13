import type { Target } from "./extension-files";

export const runScript = ({
	source,
	globals,
}: {
	source: string;
	globals: Record<string, unknown>;
}) => {
	const script = new Function(...Object.keys(globals), source);
	script(...Object.values(globals));
};

export const extensionNamespace = ({
	target,
	api,
}: {
	target: Target;
	api: unknown;
}) =>
	target === "chrome"
		? { browser: undefined, chrome: api }
		: { browser: api, chrome: undefined };
