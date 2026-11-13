import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../contexts/useAuth";

/**
 * "Add account" on the sign-in/up screens (`?mode=add-profile`), opened from
 * Settings while another account is signed in. `?restore=` is set when a
 * server switch during the add parked that account (ServerSelectSheet).
 */
export function useAddProfileMode() {
	const [searchParams] = useSearchParams();
	const navigate = useNavigate();
	const { userId, switchAccount } = useAuth();
	const addProfileMode = searchParams.get("mode") === "add-profile";
	const restoreProfileId = addProfileMode ? searchParams.get("restore") : null;

	// Keeps the add-account mode across the auth pages.
	const query = addProfileMode
		? `?${new URLSearchParams({ mode: "add-profile", ...(restoreProfileId ? { restore: restoreProfileId } : {}) })}`
		: "";

	const cancel = async () => {
		// After a server switch the page was reloaded signed out: back to the
		// account that was active (switch_account restores its server too).
		if (userId == null && restoreProfileId) {
			try {
				await switchAccount(restoreProfileId);
				navigate("/", { replace: true });
			} catch {
				// switchAccount already surfaced the error.
			}
			return;
		}
		navigate(-1);
	};

	/**
	 * Goes to another auth page in the same mode. While adding, it replaces
	 * the entry, so cancelling still leads back to where the add started.
	 */
	const goTo = (path: string) => navigate(`${path}${query}`, { replace: addProfileMode });

	return { addProfileMode, cancel, goTo };
}
