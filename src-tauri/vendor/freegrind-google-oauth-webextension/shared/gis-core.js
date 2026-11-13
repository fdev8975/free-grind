(() => {
	"use strict";

	if (window.__grindrGis) return;

	const GIS_SDK_URL = "https://accounts.google.com/gsi/client";

	const DEFAULTS = {
		clientId:
			"1036042917246-htcnf9mm3qnis86l47ngp0a9ncqsll7j.apps.googleusercontent.com",
		scope: "email profile",
		prompt: "select_account",
	};

	const gisOAuth2 = () => window.google?.accounts?.oauth2;

	let sdkLoad = null;
	const loadGisSdk = () => {
		if (gisOAuth2()) return Promise.resolve();
		if (!sdkLoad) {
			sdkLoad = (async () => {
				await new Promise((resolve, reject) => {
					const script = document.createElement("script");
					script.src = GIS_SDK_URL;
					script.async = true;
					script.onload = resolve;
					script.onerror = () =>
						reject(new Error("GIS SDK failed to load"));
					(document.head || document.documentElement).appendChild(
						script,
					);
				});
				for (let attempt = 0; attempt < 100; attempt++) {
					if (gisOAuth2()) return;
					await new Promise((resolve) => setTimeout(resolve, 50));
				}
				throw new Error("GIS SDK initialize failed");
			})().catch((error) => {
				sdkLoad = null;
				throw error;
			});
		}
		return sdkLoad;
	};

	const requestAccessToken = async (options = {}) => {
		const { clientId, scope, prompt } = { ...DEFAULTS, ...options };
		await loadGisSdk();
		return new Promise((resolve, reject) => {
			let settled = false;
			const resolveOnce = (token) => {
				if (settled) return;
				settled = true;
				resolve(token);
			};
			const rejectOnce = (error) => {
				if (settled) return;
				settled = true;
				reject(error);
			};
			const tokenClient = gisOAuth2().initTokenClient({
				client_id: clientId,
				scope,
				callback: (response) => {
					const token = response?.access_token;
					if (token) resolveOnce(token);
					else rejectOnce(new Error("GIS returned no access_token"));
				},
				error_callback: (error) => {
					const failure = new Error(
						error?.type || "token client error",
					);
					failure.code = error?.type;
					rejectOnce(failure);
				},
			});
			tokenClient.requestAccessToken({ prompt });
		});
	};

	window.__grindrGis = { loadGisSdk, requestAccessToken };
})();
