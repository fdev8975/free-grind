import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export type Target = "chrome" | "firefox" | "geckoview";

export const TARGETS: Target[] = ["chrome", "firefox", "geckoview"];
export const BROWSER_TARGETS: Target[] = ["chrome", "firefox"];

export type WebAccessibleResource = string | { resources: string[] };

export type Manifest = {
	permissions?: string[];
	action?: object;
	browser_action?: object;
	background?: { service_worker?: string; scripts?: string[] };
	content_scripts?: Array<{ js?: string[]; css?: string[] }>;
	web_accessible_resources?: WebAccessibleResource[];
	icons?: Record<string, string>;
};

export const EXTENSION_ID = "extension-id";

const repositoryRoot = new URL("../../", import.meta.url);

const repositoryPath = (path: string) =>
	fileURLToPath(new URL(path, repositoryRoot));

export const readRepositoryFile = (path: string) =>
	readFileSync(repositoryPath(path), "utf8");

export const listRepositoryDirectory = (path: string) =>
	readdirSync(repositoryPath(path));

export const extensionBaseUrl = (target: Target) =>
	`${target === "chrome" ? "chrome-extension" : "moz-extension"}://${EXTENSION_ID}/`;

export const webAccessiblePaths = (manifest: Manifest) =>
	(manifest.web_accessible_resources ?? []).flatMap((entry) =>
		typeof entry === "string" ? [entry] : entry.resources,
	);

export const targetFiles = (target: Target) => {
	const packagedPath = (path: string) => {
		const override = `${target}/overrides/${path}`;
		return existsSync(repositoryPath(override)) ? override : path;
	};
	return {
		manifest: JSON.parse(
			readRepositoryFile(`${target}/manifest.json`),
		) as Manifest,
		exists: (path: string) =>
			existsSync(repositoryPath(packagedPath(path))),
		source: (path: string) => readRepositoryFile(packagedPath(path)),
	};
};
