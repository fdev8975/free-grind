let issuedTokens = 0;

export const makeAccessToken = () => {
	issuedTokens += 1;
	const serial = String(issuedTokens).padStart(4, "0");
	return `ya29.a0Ae${serial}${"Xk9_-QwErTy".repeat(12)}`;
};
