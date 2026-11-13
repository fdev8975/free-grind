# Free Grind Google OAuth WebExtension

> [!NOTE]
> On Android, use the [Free Grind Google OAuth app](https://github.com/fdev8975/free-grind-oauth-app) instead. It bundles this extension and hands the token straight to [Free Grind](https://github.com/fdev8975/free-grind).

WebExtension that gets an OAuth access token via Google Identity Services (GIS) for signing in to Free Grind. Made possible by the fact that GIS refuses to run in embedded app WebViews, and GeckoView forbids the host app from injecting JS into pages. Based on [Open Grind's Grindr Google OAuth WebExtension](https://git.opengrind.org/open-grind/grindr-google-oauth-webextension).

## Install

- **Firefox, Librewolf** (desktop & Android): download `freegrind_google_oauth-x.x.x-firefox.zip` from [Releases](https://github.com/fdev8975/free-grind/tree/development/src-tauri/vendor/freegrind-google-oauth-webextension), unarchive, load the unpacked directory via `about:debugging` (This Firefox → "Load Temporary Add-on")
- **Google Chrome, Chromium & Chromium-based browsers** (desktop only): download `freegrind_google_oauth-x.x.x-chrome.zip` from [Releases](https://github.com/fdev8975/free-grind/tree/development/src-tauri/vendor/freegrind-google-oauth-webextension), unarchive, load the unpacked directory via `chrome://extensions` (Developer mode → "Load unpacked")
- **GeckoView** (for developers embedding this project into their Android app): download `freegrind_google_oauth-x.x.x-geckoview.zip` from [Releases](https://github.com/fdev8975/free-grind/tree/development/src-tauri/vendor/freegrind-google-oauth-webextension), bundle the built `web-ext-artifacts/geckoview/` directory in your app's `assets/` and install it as a built-in extension via `runtime.webExtensionController.ensureBuiltIn(uri, id)` (`nativeMessaging` and `geckoViewAddons` are privileged permissions that only work for a built-in extension)

Alternatively, clone the repository yourself and build the extension using `./build.sh [firefox|chrome|geckoview]` (requires [Bun](https://bun.com)).

## Usage

**Firefox, Librewolf** (desktop & Android) and **Google Chrome, Chromium & Chromium-based browsers** (desktop only):

1. Install the extension
2. Click the toolbar icon
3. A new tab opens with a button
4. Click "Sign in with Google"
5. Complete the OAuth flow in the Google window that opens
6. Tap "Copy token" on the page and paste it into Free Grind's sign-in screen (Google tab)

**GeckoView**:

1. Install the extension as a built-in (see above) and load `https://web.grindr.com/` in a `GeckoSession`. If the session is private, allow the extension in private browsing. Load `https://web.grindr.com/#autostart` instead to open Google's sign-in right away, without a tap on the button; allow the popup in your `PromptDelegate.onPopupPrompt`, otherwise the button stays as the fallback.
2. The content script blanks the page and shows a "Sign in with Google" button. After the user signs in, the token is sent to your app over native messaging.
3. Register the delegate on the extension:

```kotlin
runtime.webExtensionController
    .ensureBuiltIn(
        "resource://android/assets/grindr-google-oauth/",
        "freegrind-google-oauth-webextension@estopia.dev",
    )
    .accept { extension ->
        extension?.setMessageDelegate(delegate, "grindr_google_oauth")
        runtime.webExtensionController.setAllowedInPrivateBrowsing(extension!!, true)
    }
```

The delegate receives:

| Message                                   | Meaning                                                     |
| ----------------------------------------- | ----------------------------------------------------------- |
| `{ "type": "token", "token": "ya29..." }` | the access token                                            |
| `{ "type": "error", "error": "..." }`     | sign-in failed; the reason is already on screen in the page |

Answer every message from `onMessage`:

- `GeckoResult.fromValue(true)` once you have taken the token, or for an error you have noted
- `GeckoResult.fromException(...)` to refuse it, which puts the page back on "Try again"
- Any other reply, including `false` or `null`, also counts as taken. The page then stays on "Signing in with Google...", so move the session on (the reference app loads `shared/token.html#<token>`)
- Reply with a primitive. A `JSONObject` reply fails with "Invalid event data for callback" and the page hangs until it times out.
- Reply within 10 seconds. After that the page shows "The app didn't answer." and re-enables the button.

One delegate is kept per runtime, per extension id and native app name, and the last registration wins. If more than one activity shares the runtime, register again in `onResume()`, or a finished activity keeps the delegate and tokens go nowhere. GeckoView also queues messages sent while no delegate is registered, so register before loading the page.

A session-level delegate (`session.webExtensionController.setMessageDelegate(extension, delegate, name)`) receives messages from extension pages in that session. This extension sends none, so you do not need one.

Free Grind signs in with the token via Grindr's `/v8/sessions/thirdparty` endpoint.

## License

[MIT](./LICENSE)
