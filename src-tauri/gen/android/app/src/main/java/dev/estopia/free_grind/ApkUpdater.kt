package dev.estopia.free_grind

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInfo
import android.content.pm.PackageInstaller
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.util.Log
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.concurrent.atomic.AtomicBoolean

/**
 * In-app APK installs, modelled on Open Grind's UpdatePlugin/ApkInstaller:
 * download a release APK into cacheDir, verify it's the expected package
 * signed with *our* key, then hand it to a PackageInstaller session. Android
 * shows its own install/update confirmation; the outcome comes back through
 * [ApkUpdateResultReceiver].
 *
 * The download runs under [ApkUpdateService] (foreground service + progress
 * notification), so it survives minimizing the app and the screen turning
 * off. If the installer's confirmation arrives while the app is in the
 * background it's held back until [onAppForeground].
 *
 * Progress/outcome is reported through [emit] as `fg:apk-update` window
 * events with a `target` (see [Target.key]) and a `state` of downloading |
 * verifying | needs-permission | installing | installed | error (+ `code`).
 * The last one is kept for [currentState], so a reopened WebView can pick
 * the status back up.
 */
object ApkUpdater {
  private const val TAG = "ApkUpdater"
  private const val DIR = "apk-update"
  private const val BUFFER = 1 shl 16
  private const val EXTRA_TARGET = "dev.estopia.free_grind.extra.APK_TARGET"
  private const val MAX_ATTEMPTS = 5
  private const val RETRY_DELAY_MS = 3_000L

  enum class Target(
    val key: String,
    val fileName: String,
    val allowedPrefix: String,
  ) {
    SELF(
      "app",
      "free-grind-update.apk",
      "https://github.com/fdev8975/free-grind/releases/download/",
    );

    fun packageName(context: Context): String = when (this) {
      SELF -> context.packageName
    }

    companion object {
      fun of(key: String?): Target? = values().firstOrNull { it.key == key }
    }
  }

  private val busy = AtomicBoolean(false)

  @Volatile
  var emit: (JSONObject) -> Unit = {}

  @Volatile
  private var lastEvent: JSONObject? = null

  @Volatile
  private var lastPercent: Int? = null

  /**
   * The installer's confirmation screen, held back while the app is in the
   * background (Android blocks activity starts from there).
   */
  @Volatile
  private var pendingConfirmation: Intent? = null

  @Volatile
  private var appContext: Context? = null

  fun isBusy(): Boolean = busy.get()

  fun progressPercent(): Int? = lastPercent

  /** The last `fg:apk-update` event as JSON, or null when nothing happened in this process. */
  fun currentState(): String? = lastEvent?.toString()

  private fun event(target: Target, state: String, extra: JSONObject.() -> Unit = {}) {
    val json = JSONObject().put("target", target.key).put("state", state).apply(extra)
    lastEvent = json
    emit(json)
  }

  private fun error(target: Target, code: String, message: String? = null) {
    Log.w(TAG, "${target.key} install failed: $code ${message ?: ""}")
    event(target, "error") {
      put("code", code)
      if (message != null) put("message", message)
    }
    appContext?.let { context ->
      ApkUpdateService.stop(context)
      if (!MainActivity.inForeground && code != "canceled") {
        ApkUpdateService.showResult(context, ApkUpdateService.ResultKind.FAILED)
      }
    }
  }

  /** From MainActivity.onResume: clears our result notification and shows a held-back confirmation. */
  fun onAppForeground(context: Context) {
    ApkUpdateService.cancelResult(context)
    val confirm = pendingConfirmation ?: return
    pendingConfirmation = null
    runCatching { context.startActivity(confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
      .onFailure { error(Target.SELF, "failed", it.message) }
  }

  private fun apkFile(context: Context, target: Target): File =
    File(File(File(context.cacheDir, DIR), target.key), target.fileName)

  /** Drops a leftover APK from an earlier (finished or abandoned) update — they're 150MB+. */
  fun cleanupStale(context: Context) {
    if (busy.get() || pendingConfirmation != null) return
    runCatching { File(context.cacheDir, DIR).deleteRecursively() }
  }

  fun canInstallNow(context: Context): Boolean =
    Build.VERSION.SDK_INT < Build.VERSION_CODES.O || context.packageManager.canRequestPackageInstalls()

  fun openInstallPermissionSettings(context: Context): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return false
    return runCatching {
      context.startActivity(
        Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${context.packageName}"))
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
      )
    }.isSuccess
  }

  /** Returns false when [url] isn't one of our GitHub release assets or an install is already running. */
  fun downloadAndInstall(context: Context, url: String): Boolean {
    if (!url.startsWith(Target.SELF.allowedPrefix) || !url.endsWith(".apk")) return false
    return downloadAndInstall(context, Target.SELF) { url }
  }

  private fun downloadAndInstall(context: Context, target: Target, resolveUrl: (Target) -> String): Boolean {
    if (!busy.compareAndSet(false, true)) return false
    val appContext = context.applicationContext
    this.appContext = appContext
    pendingConfirmation = null
    lastPercent = 0
    ApkUpdateService.cancelResult(appContext)
    event(target, "downloading") {
      put("received", 0)
      put("total", -1)
    }
    // Started while the app is in front (the user just tapped "update"),
    // which is when Android still allows starting a foreground service.
    ApkUpdateService.start(appContext)
    Thread({
      try {
        val url = resolveUrl(target)
        if (!url.startsWith(target.allowedPrefix) || !url.endsWith(".apk")) {
          error(target, "untrusted-url", url)
        } else {
          val apk = download(appContext, target, url)
          if (apk != null && verify(appContext, target, apk)) installVerified(appContext, target, apk)
        }
      } catch (t: Throwable) {
        error(target, "failed", t.message)
      } finally {
        busy.set(false)
        ApkUpdateService.stop(appContext)
      }
    }, "free-grind-apk-${target.key}").start()
    return true
  }

  /** Retries the install of an already downloaded APK, e.g. after granting "install unknown apps". */
  fun installDownloaded(context: Context, target: Target = Target.SELF): Boolean {
    val apk = apkFile(context, target)
    if (!apk.isFile) return false
    if (!busy.compareAndSet(false, true)) return false
    val appContext = context.applicationContext
    this.appContext = appContext
    pendingConfirmation = null
    Thread({
      try {
        if (verify(appContext, target, apk)) installVerified(appContext, target, apk)
      } catch (t: Throwable) {
        error(target, "failed", t.message)
      } finally {
        busy.set(false)
      }
    }, "free-grind-apk-install-${target.key}").start()
    return true
  }

  private class HttpStatusException(status: Int) : IOException("HTTP $status")

  /**
   * Downloads [url] into the target's cache dir. Dropped connections (e.g.
   * switching between Wi-Fi and mobile data) are retried a few times,
   * resuming with a Range request where the server supports it.
   */
  private fun download(context: Context, target: Target, url: String): File? {
    val file = apkFile(context, target)
    file.parentFile?.deleteRecursively()
    file.parentFile?.mkdirs()
    val partial = File(file.parentFile, "${target.fileName}.part")

    var total = -1L
    var lastError: Throwable? = null
    for (attempt in 0 until MAX_ATTEMPTS) {
      if (attempt > 0) Thread.sleep(RETRY_DELAY_MS * attempt)
      try {
        total = downloadOnce(context, target, url, partial, total)
        lastError = null
        break
      } catch (e: HttpStatusException) {
        partial.delete()
        error(target, "http", e.message)
        return null
      } catch (t: IOException) {
        Log.w(TAG, "download attempt ${attempt + 1} failed", t)
        lastError = t
      }
    }
    if (lastError != null) {
      partial.delete()
      error(target, "network", lastError.message)
      return null
    }
    if (total > 0 && partial.length() != total) {
      partial.delete()
      error(target, "incomplete")
      return null
    }
    if (!partial.renameTo(file)) {
      error(target, "failed", "rename")
      return null
    }
    return file
  }

  /** One connection's worth of download into [partial]; returns the full size, or -1 if unknown. */
  private fun downloadOnce(context: Context, target: Target, url: String, partial: File, knownTotal: Long): Long {
    val offset = if (partial.isFile) partial.length() else 0L
    val connection = (URL(url).openConnection() as HttpURLConnection).apply {
      instanceFollowRedirects = true
      connectTimeout = 20_000
      readTimeout = 30_000
      setRequestProperty("Accept", "application/octet-stream")
      if (offset > 0) setRequestProperty("Range", "bytes=$offset-")
    }
    try {
      val status = connection.responseCode
      if (status == 416 && knownTotal > 0 && offset == knownTotal) return knownTotal
      if (status !in 200..299) throw HttpStatusException(status)
      // A 200 to a Range request means the server ignored it: start over.
      val resumed = offset > 0 && status == HttpURLConnection.HTTP_PARTIAL
      val length = connection.contentLengthLong
      val total = when {
        length < 0 -> knownTotal
        resumed -> offset + length
        else -> length
      }
      var received = if (resumed) offset else 0L
      reportProgress(context, target, received, total, force = true)
      connection.inputStream.use { input ->
        FileOutputStream(partial, resumed).use { output ->
          val buffer = ByteArray(BUFFER)
          while (true) {
            val read = input.read(buffer)
            if (read < 0) break
            output.write(buffer, 0, read)
            received += read
            reportProgress(context, target, received, total)
          }
        }
      }
      if (total > 0 && received < total) throw IOException("connection closed at $received/$total")
      return total
    } finally {
      connection.disconnect()
    }
  }

  private fun reportProgress(context: Context, target: Target, received: Long, total: Long, force: Boolean = false) {
    val percent = if (total > 0) ((received * 100) / total).toInt() else null
    if (!force && percent == lastPercent) return
    lastPercent = percent
    event(target, "downloading") {
      put("received", received)
      put("total", total)
    }
    ApkUpdateService.updateProgress(context, percent)
  }

  @Suppress("DEPRECATION")
  private fun archiveInfo(pm: PackageManager, apk: File): PackageInfo? {
    val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      PackageManager.GET_SIGNING_CERTIFICATES
    } else {
      PackageManager.GET_SIGNATURES
    }
    return pm.getPackageArchiveInfo(apk.path, flags)
  }

  @Suppress("DEPRECATION")
  private fun installedInfo(pm: PackageManager, packageName: String): PackageInfo? {
    val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      PackageManager.GET_SIGNING_CERTIFICATES
    } else {
      PackageManager.GET_SIGNATURES
    }
    return try {
      pm.getPackageInfo(packageName, flags)
    } catch (e: PackageManager.NameNotFoundException) {
      null
    }
  }

  @Suppress("DEPRECATION")
  private fun signerDigests(info: PackageInfo): Set<String> {
    val signatures = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      val signing = info.signingInfo ?: return emptySet()
      if (signing.hasMultipleSigners()) signing.apkContentsSigners else signing.signingCertificateHistory
    } else {
      info.signatures
    } ?: return emptySet()
    val sha = MessageDigest.getInstance("SHA-256")
    return signatures.map { sig -> sha.digest(sig.toByteArray()).joinToString("") { "%02x".format(it) } }.toSet()
  }

  @Suppress("DEPRECATION")
  private fun versionCodeOf(info: PackageInfo): Long =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) info.longVersionCode else info.versionCode.toLong()

  private fun verify(context: Context, target: Target, apk: File): Boolean {
    event(target, "verifying")
    ApkUpdateService.updateProgress(context, null, verifying = true)
    val pm = context.packageManager
    val archive = archiveInfo(pm, apk)
    if (archive == null) {
      error(target, "unreadable")
      return false
    }
    val expectedPackage = target.packageName(context)
    if (archive.packageName != expectedPackage) {
      error(target, "package-mismatch", archive.packageName)
      return false
    }
    // The self-update is signed with this build's key by definition.
    val ours = installedInfo(pm, context.packageName)?.let(::signerDigests).orEmpty()
    val theirs = signerDigests(archive)
    // Android would refuse a foreign signer on update too, but only after the
    // user confirmed — fail early with a clear reason (e.g. a debug build).
    if (ours.isEmpty() || theirs.isEmpty() || ours.intersect(theirs).isEmpty()) {
      error(target, "foreign-signer")
      return false
    }
    val installed = installedInfo(pm, expectedPackage)
    if (installed != null && versionCodeOf(archive) < versionCodeOf(installed)) {
      error(target, "downgrade")
      return false
    }
    return true
  }

  private fun installVerified(context: Context, target: Target, apk: File) {
    if (!canInstallNow(context)) {
      event(target, "needs-permission")
      ApkUpdateService.stop(context)
      if (!MainActivity.inForeground) {
        ApkUpdateService.showResult(context, ApkUpdateService.ResultKind.NEEDS_PERMISSION)
      }
      return
    }
    event(target, "installing")
    val installer = context.packageManager.packageInstaller
    installer.mySessions.forEach { runCatching { installer.abandonSession(it.sessionId) } }

    val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL).apply {
      setAppPackageName(target.packageName(context))
      setSize(apk.length())
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        setInstallReason(PackageManager.INSTALL_REASON_USER)
      }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED)
      }
    }
    val sessionId = installer.createSession(params)
    try {
      installer.openSession(sessionId).use { session ->
        session.openWrite("base.apk", 0, apk.length()).use { output ->
          apk.inputStream().use { input -> input.copyTo(output, BUFFER) }
          session.fsync(output)
        }
        // targetSdk 31+ needs an explicit mutability flag; the installer fills in extras.
        var flags = PendingIntent.FLAG_UPDATE_CURRENT
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) flags = flags or PendingIntent.FLAG_MUTABLE
        val intent = Intent(context, ApkUpdateResultReceiver::class.java).putExtra(EXTRA_TARGET, target.key)
        val sender = PendingIntent.getBroadcast(context, sessionId, intent, flags).intentSender
        session.commit(sender)
      }
    } catch (t: Throwable) {
      runCatching { installer.abandonSession(sessionId) }
      throw t
    }
  }

  internal fun onInstallStatus(context: Context, intent: Intent) {
    appContext = context.applicationContext
    val status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)
    val message = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE)
    val target = Target.of(intent.getStringExtra(EXTRA_TARGET)) ?: Target.SELF
    when (status) {
      PackageInstaller.STATUS_PENDING_USER_ACTION -> {
        val confirm = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
          intent.getParcelableExtra(Intent.EXTRA_INTENT, Intent::class.java)
        } else {
          @Suppress("DEPRECATION")
          intent.getParcelableExtra<Intent>(Intent.EXTRA_INTENT)
        }
        if (confirm == null) {
          error(target, "failed", "missing confirmation intent")
          return
        }
        ApkUpdateService.stop(context)
        if (MainActivity.inForeground) {
          runCatching { context.startActivity(confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
            .onFailure { error(target, "failed", it.message) }
        } else {
          // Android won't open it from the background: hold it until the
          // user comes back (or taps the notification) instead of failing.
          pendingConfirmation = confirm
          ApkUpdateService.showResult(context, ApkUpdateService.ResultKind.READY)
        }
      }
      // Never seen for a self-update, which kills this process.
      PackageInstaller.STATUS_SUCCESS -> {
        cleanupStale(context)
        event(target, "installed")
      }
      PackageInstaller.STATUS_FAILURE_ABORTED -> error(target, "canceled")
      PackageInstaller.STATUS_FAILURE_CONFLICT -> error(target, "conflict", message)
      PackageInstaller.STATUS_FAILURE_INCOMPATIBLE -> error(target, "incompatible", message)
      PackageInstaller.STATUS_FAILURE_STORAGE -> error(target, "storage", message)
      PackageInstaller.STATUS_FAILURE_BLOCKED -> error(target, "blocked", message)
      else -> error(target, "failed", message)
    }
  }
}

class ApkUpdateResultReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    ApkUpdater.onInstallStatus(context, intent)
  }
}
