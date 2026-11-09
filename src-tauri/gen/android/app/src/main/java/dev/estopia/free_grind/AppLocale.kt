package dev.estopia.free_grind

import android.app.Activity
import android.app.LocaleManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.LocaleList
import android.provider.Settings
import android.util.Log
import org.json.JSONObject

/**
 * Android 13+ per-app language ("App languages" in the system settings).
 * The languages offered there come from res/xml/locales_config.xml, which
 * build.gradle.kts generates from public/locales. The UI itself is i18next
 * in the WebView, so the frontend reads the chosen language through
 * `FreeGrindBridge.getAppLocaleState()` and follows `fg:app-locale` events
 * (see src/services/appLocaleBridge.ts). Below Android 13 none of this
 * exists and the frontend keeps its own language picker.
 */
object AppLocale {
    private const val TAG = "AppLocale"

    fun isSupported(): Boolean = Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU

    /**
     * `{ "app": "de", "system": "de-DE,en-US" }` as BCP 47 tag lists; "app"
     * is "" while the app follows the system language. null below Android 13.
     */
    fun stateJson(context: Context): String? {
        if (!isSupported()) return null
        return try {
            val manager = context.getSystemService(LocaleManager::class.java) ?: return null
            JSONObject()
                .put("app", manager.applicationLocales.toLanguageTags())
                .put("system", manager.systemLocales.toLanguageTags())
                .toString()
        } catch (e: Exception) {
            Log.w(TAG, "Reading app locale failed", e)
            null
        }
    }

    /** Sets the app language to [languageTags] ("" = follow the system). */
    fun set(context: Context, languageTags: String): Boolean {
        if (!isSupported()) return false
        return try {
            val manager = context.getSystemService(LocaleManager::class.java) ?: return false
            manager.applicationLocales = LocaleList.forLanguageTags(languageTags)
            true
        } catch (e: Exception) {
            Log.w(TAG, "Setting app locale failed", e)
            false
        }
    }

    /** Opens this app's page under Settings > System > Languages > App languages. */
    fun openSettings(activity: Activity): Boolean {
        if (!isSupported()) return false
        return try {
            activity.startActivity(
                Intent(
                    Settings.ACTION_APP_LOCALE_SETTINGS,
                    Uri.fromParts("package", activity.packageName, null),
                )
            )
            true
        } catch (e: Exception) {
            // Some OEM builds lack the per-app page; the frontend then falls
            // back to its own picker.
            Log.w(TAG, "Opening app locale settings failed", e)
            false
        }
    }
}
