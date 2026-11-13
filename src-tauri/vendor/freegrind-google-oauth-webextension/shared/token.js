(() => {
	"use strict";

	const decode = (value) => {
		try {
			return decodeURIComponent(value);
		} catch {
			return "";
		}
	};

	const token = decode(location.hash.slice(1));
	try {
		history.replaceState(null, "", location.pathname);
	} catch {
		location.hash = "";
	}

	window.__grindrOauthUi.showToken(token);
})();
