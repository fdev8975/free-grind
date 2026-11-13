import { webextension } from "@opengrind/config/eslint/webext";
import ts from "typescript-eslint";

export default [
	...webextension(),
	...ts.configs.recommended.map((config) => ({
		...config,
		files: ["test/**/*.ts"],
	})),
];
