package dev.estopia.free_grind

import android.content.Context
import android.util.Log
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.google.firebase.messaging.FirebaseMessaging
import org.json.JSONObject

/**
 * Owns the Firebase setup for push. Initialized from FreeGrindApplication so
 * it's ready whenever the process starts — including when a push wakes a
 * killed app and MainActivity never runs.
 */
object PushFirebase {
    private const val TAG = "FCM"

    @Volatile
    private var initialized = false

    @Synchronized
    fun initialize(context: Context) {
        if (initialized) return
        try {
            val spoofed = SpoofedContext(context.applicationContext)
            val options = FirebaseOptions.Builder()
                .setApplicationId(context.getString(R.string.fcm_google_app_id))
                .setProjectId(context.getString(R.string.fcm_project_id))
                .setApiKey(context.getString(R.string.fcm_google_api_key))
                .setGcmSenderId(context.getString(R.string.fcm_gcm_defaultSenderId))
                .build()
            if (FirebaseApp.getApps(spoofed).isEmpty()) {
                FirebaseApp.initializeApp(spoofed, options)
            }
            initialized = true
            Log.d(TAG, "Firebase initialized with spoofed context")
        } catch (t: Throwable) {
            Log.e(TAG, "Firebase initialization failed; continuing without push", t)
        }
    }

    /** Name of the second FirebaseApp, for a self-hosted server's own Firebase project. */
    private const val SELF_HOSTED_APP = "selfhosted"

    /**
     * Registers with a self-hosted server's Firebase project (public config
     * from its `push_fcm_config` assignment) next to Grindr's default app,
     * and hands back that project's token. Messages from both projects land
     * in FreeGrindFirebaseMessagingService. Uses the real package context:
     * the self-hosted project registers this app's own package name.
     */
    @Synchronized
    fun selfHostedToken(context: Context, configJson: String, onToken: (String) -> Unit) {
        try {
            val cfg = JSONObject(configJson)
            val options = FirebaseOptions.Builder()
                .setApplicationId(cfg.getString("applicationId"))
                .setProjectId(cfg.getString("projectId"))
                .setApiKey(cfg.getString("apiKey"))
                .setGcmSenderId(cfg.getString("senderId"))
                .build()
            val appContext = context.applicationContext
            var app = FirebaseApp.getApps(appContext).firstOrNull { it.name == SELF_HOSTED_APP }
            if (app != null && app.options != options) {
                // The server switched to another Firebase project.
                app.delete()
                app = null
            }
            if (app == null) app = FirebaseApp.initializeApp(appContext, options, SELF_HOSTED_APP)
            app.get(FirebaseMessaging::class.java).token.addOnCompleteListener { task ->
                if (task.isSuccessful) onToken(task.result) else Log.w(TAG, "Self-hosted push token failed", task.exception)
            }
        } catch (t: Throwable) {
            Log.e(TAG, "Self-hosted Firebase setup failed; continuing without its push", t)
        }
    }

    fun token(onToken: (String) -> Unit) {
        if (!initialized) {
            Log.w(TAG, "Firebase not initialized; no push token")
            return
        }
        try {
            FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
                if (task.isSuccessful) {
                    onToken(task.result)
                } else {
                    Log.w(TAG, "Failed to get push token", task.exception)
                }
            }
        } catch (t: Throwable) {
            Log.e(TAG, "Firebase Messaging unavailable; continuing without push token", t)
        }
    }
}