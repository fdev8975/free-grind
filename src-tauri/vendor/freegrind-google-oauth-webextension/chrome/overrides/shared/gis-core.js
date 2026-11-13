(() => {
	"use strict";

	// Chrome (MV3) only because Google rejects remotely-loaded GIS with the reason:
	// "Including remotely hosted code in a Manifest V3 item.""

	if (window.__grindrGis) return;

	const DEFAULTS = {
		clientId:
			"1036042917246-htcnf9mm3qnis86l47ngp0a9ncqsll7j.apps.googleusercontent.com",
		scope: "email profile",
		prompt: "select_account",
	};

	const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
	const MESSAGE_ORIGIN = "https://accounts.google.com";

	const loadGisSdk = () => Promise.resolve();

	const buildAuthUrl = (id, { clientId, scope, prompt }) => {
		const scheme = location.protocol.replace(":", "");
		const params = new URLSearchParams({
			gsiwebsdk: "3",
			client_id: clientId,
			scope,
			redirect_uri: `storagerelay://${scheme}/${location.host}?id=${id}`,
			response_type: "token",
			prompt,
			include_granted_scopes: "true",
		});
		return `${AUTH_ENDPOINT}?${params.toString()}`;
	};

	const requestAccessToken = (options = {}) => {
		const config = { ...DEFAULTS, ...options };
		return new Promise((resolve, reject) => {
			const id = "auth" + Math.floor(Math.random() * 1e6 + 1);
			let settled = false;
			let popup = null;
			let poll = null;

			const teardown = () => {
				window.removeEventListener("message", onMessage);
				if (poll) clearInterval(poll);
			};
			const resolveOnce = (token) => {
				if (settled) return;
				settled = true;
				teardown();
				resolve(token);
			};
			const rejectOnce = (code, message) => {
				if (settled) return;
				settled = true;
				teardown();
				const error = new Error(message || code);
				error.code = code;
				reject(error);
			};

			const onMessage = (event) => {
				if (event.origin !== MESSAGE_ORIGIN) return;
				let data;
				try {
					data = JSON.parse(event.data);
				} catch {
					return;
				}
				const result = data?.params;
				if (
					!result ||
					result.id !== id ||
					result.clientId !== config.clientId ||
					result.type !== "authResult"
				) {
					return;
				}
				const auth = result.authResult;
				if (auth?.access_token) resolveOnce(auth.access_token);
				else
					rejectOnce(
						auth?.error || "token client error",
						auth?.error_description,
					);
				try {
					popup?.close();
				} catch {
					// popup may already be closed
				}
			};

			window.addEventListener("message", onMessage);
			popup = window.open(
				buildAuthUrl(id, config),
				"_blank",
				"popup,width=515,height=600",
			);
			if (!popup) {
				rejectOnce("popup_failed_to_open");
				return;
			}
			poll = setInterval(() => {
				if (popup.closed) rejectOnce("popup_closed");
			}, 500);
		});
	};

	window.__grindrGis = { loadGisSdk, requestAccessToken };
})();
