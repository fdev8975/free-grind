const sleep = (milliseconds: number) =>
	new Promise((resolve) => setTimeout(resolve, milliseconds));

export const flush = async (turns = 6) => {
	for (let turn = 0; turn < turns; turn++) await sleep(2);
};

const holds = (predicate: () => unknown) => {
	try {
		return Boolean(predicate());
	} catch {
		return false;
	}
};

export const waitFor = async (
	predicate: () => unknown,
	{ timeout = 4000, label = "condition" } = {},
) => {
	const deadline = Date.now() + timeout;
	while (!holds(predicate)) {
		if (Date.now() > deadline) {
			throw new Error(`timed out waiting for ${label}`);
		}
		await sleep(3);
	}
};
