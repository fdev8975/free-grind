import type { Document, HTMLScriptElement, Node, Window } from "happy-dom";

type ScriptLoader = (script: HTMLScriptElement) => void;

const loadersByDocument = new WeakMap<Document, ScriptLoader>();
const patchedPrototypes = new WeakSet<object>();

const patchAppendChild = (window: Window) => {
	const prototype = window.Node.prototype;
	if (patchedPrototypes.has(prototype)) return;
	patchedPrototypes.add(prototype);
	const nativeAppendChild = prototype.appendChild;
	prototype.appendChild = function (this: Node, node: Node) {
		const load = loadersByDocument.get(node.ownerDocument);
		if (load && node instanceof window.HTMLScriptElement && node.src) {
			load(node);
			return node;
		}
		return nativeAppendChild.call(this, node);
	};
};

export const interceptScriptLoads = ({
	window,
	load,
}: {
	window: Window;
	load: ScriptLoader;
}) => {
	patchAppendChild(window);
	loadersByDocument.set(window.document, load);
};
