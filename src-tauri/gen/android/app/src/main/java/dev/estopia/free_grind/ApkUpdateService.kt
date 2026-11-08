package dev.estopia.free_grind

import android.annotation.SuppressLint
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Color
import android.net.Uri
import android.net.wifi.WifiManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.util.Log
import androidx.core.app.NotificationCompat

/**
 * Keeps an [ApkUpdater] download alive while the app is minimized or the
 * screen is off: a foreground service stops Android from freezing the
 * process (and lets it keep network access in Doze), the wake/Wi-Fi locks
 * keep CPU and radio up. The work itself still runs on ApkUpdater's thread;
 * this only owns the ongoing progress notification.
 *
 * Also posts the "update ready / needs permission / failed" notification when
 * the download finishes while the app isn't in front, since Android won't let
 * a background app open the installer's confirmation screen itself.
 */
class ApkUpdateService : Service() {
  private var wakeLock: PowerManager.WakeLock? = null
  private var wifiLock: WifiManager.WifiLock? = null

  enum class ResultKind { READY, NEEDS_PERMISSION, FAILED }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val notification = progressNotification(this, ApkUpdater.progressPercent())
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        startForeground(PROGRESS_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
      } else {
        startForeground(PROGRESS_ID, notification)
      }
    } catch (t: Throwable) {
      // E.g. ForegroundServiceStartNotAllowedException; the download still
      // runs, just without the background guarantees.
      Log.w(TAG, "startForeground failed", t)
      stopSelf()
      return START_NOT_STICKY
    }
    instance = this
    acquireLocks()
    // The download may already be over by the time the service came up.
    if (!ApkUpdater.isBusy()) finish()
    return START_NOT_STICKY
  }

  // Android 15+: dataSync services get a daily time budget.
  override fun onTimeout(startId: Int, fgsType: Int) {
    finish()
  }

  override fun onDestroy() {
    if (instance === this) instance = null
    releaseLocks()
    super.onDestroy()
  }

  private fun finish() {
    releaseLocks()
    stopForeground(STOP_FOREGROUND_REMOVE)
    stopSelf()
  }

  @SuppressLint("WakelockTimeout")
  @Suppress("DEPRECATION") // WIFI_MODE_FULL_HIGH_PERF, still honored while the screen is off
  private fun acquireLocks() {
    if (wakeLock == null) {
      wakeLock = runCatching {
        (getSystemService(Context.POWER_SERVICE) as PowerManager)
          .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "free-grind:apk-update")
          .apply { setReferenceCounted(false); acquire(WAKE_LOCK_TIMEOUT_MS) }
      }.getOrNull()
    }
    if (wifiLock == null) {
      wifiLock = runCatching {
        (applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager)
          .createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "free-grind:apk-update")
          .apply { setReferenceCounted(false); acquire() }
      }.getOrNull()
    }
  }

  private fun releaseLocks() {
    runCatching { wakeLock?.takeIf { it.isHeld }?.release() }
    runCatching { wifiLock?.takeIf { it.isHeld }?.release() }
    wakeLock = null
    wifiLock = null
  }

  companion object {
    private const val TAG = "ApkUpdateService"
    private const val PROGRESS_CHANNEL_ID = "free_grind_app_update_progress"
    private const val RESULT_CHANNEL_ID = "free_grind_app_update"
    private const val PROGRESS_ID = 0x0A9C0001
    private const val RESULT_ID = 0x0A9C0002
    private const val WAKE_LOCK_TIMEOUT_MS = 60 * 60 * 1000L

    // Own strings, synced from push_notifications.* like the push texts.
    const val DOWNLOADING = "APK_UPDATE_DOWNLOADING"
    const val VERIFYING = "APK_UPDATE_VERIFYING"
    const val READY_TITLE = "APK_UPDATE_READY_TITLE"
    const val READY_BODY = "APK_UPDATE_READY_BODY"
    const val PERMISSION_BODY = "APK_UPDATE_PERMISSION_BODY"
    const val FAILED_TITLE = "APK_UPDATE_FAILED_TITLE"
    const val FAILED_BODY = "APK_UPDATE_FAILED_BODY"

    fun start(context: Context) {
      val intent = Intent(context, ApkUpdateService::class.java)
      runCatching {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent)
        else context.startService(intent)
      }.onFailure { Log.w(TAG, "Couldn't start the update service", it) }
    }

    @Volatile
    private var instance: ApkUpdateService? = null

    /**
     * Ends the foreground service. Not via stopService(): stopping it before
     * it reached startForeground() crashes the app, so a service that's
     * still starting up stops itself once it sees the download is over.
     */
    fun stop(context: Context) {
      val running = instance
      if (running != null) {
        Handler(Looper.getMainLooper()).post { running.finish() }
      }
      runCatching { manager(context).cancel(PROGRESS_ID) }
    }

    /** Refreshes the ongoing notification; [percent] null = indeterminate. */
    fun updateProgress(context: Context, percent: Int?, verifying: Boolean = false) {
      runCatching { manager(context).notify(PROGRESS_ID, progressNotification(context, percent, verifying)) }
    }

    /** Shown when an update needs the user while the app is in the background. */
    fun showResult(context: Context, kind: ResultKind) {
      ensureChannels(context)
      val (title, body) = when (kind) {
        ResultKind.READY -> READY_TITLE to READY_BODY
        ResultKind.NEEDS_PERMISSION -> READY_TITLE to PERMISSION_BODY
        ResultKind.FAILED -> FAILED_TITLE to FAILED_BODY
      }
      val notification = baseBuilder(context, RESULT_CHANNEL_ID)
        .setContentTitle(NotificationStrings.text(context, title))
        .setContentText(NotificationStrings.text(context, body))
        .setCategory(if (kind == ResultKind.FAILED) NotificationCompat.CATEGORY_ERROR else NotificationCompat.CATEGORY_STATUS)
        .setAutoCancel(true)
        .setOnlyAlertOnce(true)
        .build()
      runCatching { manager(context).notify(RESULT_ID, notification) }
    }

    fun cancelResult(context: Context) {
      runCatching { manager(context).cancel(RESULT_ID) }
    }

    private fun manager(context: Context) =
      context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

    private fun ensureChannels(context: Context) {
      val nm = manager(context)
      if (nm.getNotificationChannel(PROGRESS_CHANNEL_ID) == null) {
        nm.createNotificationChannel(
          NotificationChannel(PROGRESS_CHANNEL_ID, "Update download", NotificationManager.IMPORTANCE_LOW)
            .apply { setShowBadge(false) },
        )
      }
      if (nm.getNotificationChannel(RESULT_CHANNEL_ID) == null) {
        nm.createNotificationChannel(
          NotificationChannel(RESULT_CHANNEL_ID, "App updates", NotificationManager.IMPORTANCE_HIGH),
        )
      }
    }

    private fun openAppIntent(context: Context): PendingIntent {
      val intent = Intent(context, MainActivity::class.java).apply {
        flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
        data = Uri.parse("freegrind-apk-update://open")
      }
      return PendingIntent.getActivity(
        context, PROGRESS_ID, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
      )
    }

    private fun baseBuilder(context: Context, channel: String): NotificationCompat.Builder =
      NotificationCompat.Builder(context, channel)
        .setSmallIcon(AppDisguise.currentDisguise(context).notificationIconRes)
        .addExtras(AppDisguise.notificationExtras(context))
        .setColor(Color.TRANSPARENT)
        .setContentIntent(openAppIntent(context))

    private fun progressNotification(context: Context, percent: Int?, verifying: Boolean = false) =
      run {
        ensureChannels(context)
        baseBuilder(context, PROGRESS_CHANNEL_ID)
          .setContentTitle(NotificationStrings.text(context, if (verifying) VERIFYING else DOWNLOADING))
          .setContentText(if (!verifying && percent != null) "$percent %" else null)
          .setProgress(100, percent ?: 0, verifying || percent == null)
          .setOngoing(true)
          .setOnlyAlertOnce(true)
          .setSilent(true)
          .setCategory(NotificationCompat.CATEGORY_PROGRESS)
          .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
          .build()
      }
  }
}
