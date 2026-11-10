// Prints the TAURI_CONFIG merge patch for the Free Grind server built into the
// app. Its addresses come only from the build environment (no defaults):
//   FG_API_URL   REST/WebSocket   (read by Rust, grindr-patched/src/server.rs)
//   FG_MEDIA_URL media host       (Rust; here: HTTP scope for the media cache)
//   FG_RTC_URL   LiveKit host     (here: CSP connect-src for video calls)
// Without them the patch is empty and the build has no Free Grind server.
// Only these exact hosts are added, nothing broader.
import { readdirSync, readFileSync } from "node:fs";

const env = (name) => (process.env[name] || "").trim();
const tauriDir = new URL("../src-tauri/", import.meta.url);
const conf = JSON.parse(readFileSync(new URL("tauri.conf.json", tauriDir), "utf8"));
const patch = {};

// LiveKit: WebSocket plus the same host over HTTPS (LiveKit uses it to
// diagnose failed connections).
const rtc = env("FG_RTC_URL").split(/[\s,]+/).filter(Boolean);
if (rtc.length) {
	const extra = [];
	for (const origin of rtc) {
		const url = new URL(origin);
		if (url.protocol !== "wss:" && url.protocol !== "ws:") throw new Error(`FG_RTC_URL: expected wss:// (or ws:// for local tests), got ${origin}`);
		extra.push(`${url.protocol}//${url.host}`, `${url.protocol === "wss:" ? "https:" : "http:"}//${url.host}`);
	}
	const csp = conf.app.security.csp;
	const connect = [...new Set([...csp["connect-src"].split(" "), ...extra])].join(" ");
	patch.app = { security: { csp: { ...csp, "connect-src": connect } } };
}

// Media host for the frontend's HTTP plugin (chat media cache). Listing
// capabilities replaces auto-discovery, so the existing files are listed too.
const media = env("FG_MEDIA_URL");
if (media) {
	const url = new URL(media);
	if (url.protocol !== "https:") throw new Error(`FG_MEDIA_URL: expected https://, got ${media}`);
	const capDir = new URL("capabilities/", tauriDir);
	const existing = readdirSync(capDir)
		.filter((f) => f.endsWith(".json"))
		.map((f) => JSON.parse(readFileSync(new URL(f, capDir), "utf8")).identifier);
	const main = JSON.parse(readFileSync(new URL("default.json", capDir), "utf8"));
	const inline = {
		identifier: "free-grind-media",
		description: "HTTP access to the Free Grind media host (set at build time)",
		windows: main.windows,
		permissions: [{ identifier: "http:default", allow: [{ url: `${url.origin}/*` }] }],
	};
	patch.app = { ...patch.app, security: { ...patch.app?.security, capabilities: [...existing, inline] } };
}

process.stdout.write(JSON.stringify(patch));
