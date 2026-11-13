import type { Window } from "happy-dom";

import { makeAccessToken } from "./access-tokens";

export type GisOutcome =
	"token" | "denied" | "popup_closed" | "popup_failed_to_open" | "pending";

type TokenResponse = {
	access_token?: string;
	error?: string;
	error_description?: string;
};

type TokenClientConfig = {
	callback: (response: TokenResponse) => void;
	error_callback: (error: { type: GisOutcome }) => void;
};

type FakePopup = { closed: boolean; close: () => void };

type Respond = (outcome: GisOutcome) => void;

const storageRelayRequestId = (authUrl: URL) => {
	const redirect = authUrl.searchParams.get("redirect_uri") ?? "";
	const relay = new URL(redirect.replace(/^storagerelay:\/\//, "https://"));
	return relay.searchParams.get("id");
};

export const installFakeGis = (
	window: Window,
	{ outcomes }: { outcomes: GisOutcome[] },
) => {
	const queuedOutcomes = [...outcomes];
	const tokensIssued: string[] = [];
	const pendingResponses: Respond[] = [];
	const popups: Array<{ url: string; popup: FakePopup }> = [];
	let requests = 0;

	const takeOutcome = () => {
		requests += 1;
		return queuedOutcomes.shift() ?? "token";
	};

	const issueToken = () => {
		const token = makeAccessToken();
		tokensIssued.push(token);
		return token;
	};

	const schedule = ({
		respond,
		outcome,
	}: {
		respond: Respond;
		outcome: GisOutcome;
	}) => {
		if (outcome === "pending") pendingResponses.push(respond);
		else window.setTimeout(() => respond(outcome));
	};

	const answerTokenClient = (config: TokenClientConfig) => {
		const respond: Respond = (outcome) => {
			if (outcome === "token") {
				config.callback({ access_token: issueToken() });
			} else if (outcome === "denied") {
				config.callback({
					error: "access_denied",
					error_description: "The user denied access",
				});
			} else if (outcome !== "pending") {
				config.error_callback({ type: outcome });
			}
		};
		schedule({ respond, outcome: takeOutcome() });
	};

	const installTokenClient = () =>
		Object.assign(window, {
			google: {
				accounts: {
					oauth2: {
						initTokenClient: (config: TokenClientConfig) => ({
							requestAccessToken: () => answerTokenClient(config),
						}),
					},
				},
			},
		});

	const authResultFor = (outcome: GisOutcome) =>
		outcome === "token"
			? { access_token: issueToken(), token_type: "Bearer" }
			: {
					error: outcome === "denied" ? "access_denied" : outcome,
					error_description: undefined,
				};

	const openAuthPopup = (url: string) => {
		const outcome = takeOutcome();
		if (outcome === "popup_failed_to_open") return null;
		const popup: FakePopup = {
			closed: false,
			close: () => {
				popup.closed = true;
			},
		};
		popups.push({ url, popup });
		const authUrl = new URL(url);
		const params = {
			id: storageRelayRequestId(authUrl),
			clientId: authUrl.searchParams.get("client_id"),
			type: "authResult",
		};
		const respond: Respond = (result) => {
			if (result === "popup_closed") {
				popup.closed = true;
				return;
			}
			if (result === "pending") return;
			window.dispatchEvent(
				new window.MessageEvent("message", {
					origin: "https://accounts.google.com",
					data: JSON.stringify({
						params: {
							...params,
							authResult: authResultFor(result),
						},
					}),
				}),
			);
		};
		schedule({ respond, outcome });
		return popup;
	};

	Object.assign(window, { open: openAuthPopup });

	return {
		installTokenClient,
		tokensIssued,
		popups,
		get requests() {
			return requests;
		},
		resolvePending: (outcome: GisOutcome = "token") => {
			const respond = pendingResponses.shift();
			if (!respond)
				throw new Error("no Google sign-in request is pending");
			respond(outcome);
		},
	};
};

export type FakeGis = ReturnType<typeof installFakeGis>;
