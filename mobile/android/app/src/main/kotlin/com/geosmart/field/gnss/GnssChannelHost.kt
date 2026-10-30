package com.geosmart.field.gnss

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.pm.PackageManager
import android.os.Build
import io.flutter.plugin.common.EventChannel
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import java.io.IOException

/// Branchement des canaux du contrat `contracts/gnss-channel.md`.
///
/// `MethodChannel` recoit les commandes et les blocs RTCM, `EventChannel`
/// renvoie les phrases NMEA brutes. Les permissions Bluetooth sont demandees
/// a l'execution, puis l'action initiale reprend automatiquement.
class GnssChannelHost(
    private val activity: Activity,
    private val methodChannel: MethodChannel,
    private val eventChannel: EventChannel,
) : MethodChannel.MethodCallHandler, EventChannel.StreamHandler {

    companion object {
        const val METHOD_CHANNEL = "com.geosmart/gnss_control"
        const val EVENT_CHANNEL = "com.geosmart/gnss_stream"
        const val PERMISSION_REQUEST_CODE = 4031

        const val ERROR_STREAM_DISCONNECTED = "STREAM_DISCONNECTED"
        const val ERROR_PERMISSIONS = "PERMISSIONS_REQUIRED"
        const val ERROR_BLUETOOTH = "BLUETOOTH_UNAVAILABLE"
        const val ERROR_INVALID_ARGUMENT = "INVALID_ARGUMENT"
        const val ERROR_SIMULATION = "SIMULATION_UNAVAILABLE"

        private const val SIMULATION_INTERVAL_MS = 1_000L
    }

    private var eventSink: EventChannel.EventSink? = null
    private var pending: PendingCall? = null
    private var simulator: NmeaSimulator? = null
    private var simulation = false
    private val casterVault = CasterCredentialVault(activity)

    private val connector = BluetoothGnssConnector(
        context = activity,
        listener = object : BluetoothGnssConnector.Listener {
            override fun onNmea(line: String) {
                activity.runOnUiThread {
                    if (simulation) return@runOnUiThread
                    eventSink?.success(line)
                }
            }

            override fun onStatus(status: GnssStatus, detail: String?) {
                activity.runOnUiThread {
                    when (status) {
                        GnssStatus.CONNECTED -> simulation = false
                        GnssStatus.ERROR -> eventSink?.error(
                            ERROR_STREAM_DISCONNECTED,
                            detail ?: GnssStatus.ERROR.code,
                            null,
                        )
                        GnssStatus.RECONNECTING -> eventSink?.error(
                            ERROR_STREAM_DISCONNECTED,
                            detail ?: GnssStatus.RECONNECTING.code,
                            null,
                        )
                        else -> Unit
                    }
                }
            }
        },
    )

    private data class PendingCall(
        val result: MethodChannel.Result,
        val action: () -> Unit,
    )

    fun attach() {
        methodChannel.setMethodCallHandler(this)
        eventChannel.setStreamHandler(this)
    }

    fun detach() {
        methodChannel.setMethodCallHandler(null)
        eventChannel.setStreamHandler(null)
        simulator?.stop()
        simulator = null
        simulation = false
        pending = null
        connector.close()
        eventSink = null
    }

    override fun onListen(arguments: Any?, events: EventChannel.EventSink?) {
        eventSink = events
    }

    override fun onCancel(arguments: Any?) {
        eventSink = null
    }

    @SuppressLint("InlinedApi")
    override fun onMethodCall(call: MethodCall, result: MethodChannel.Result) {
        when (call.method) {
            "requestPermissions" -> withPermissions(result) {
                result.success(true)
            }

            "startScan" -> withPermissions(result) { performScan(result) }

            "connectDevice" -> {
                val address = call.argument<String>("address")
                if (address.isNullOrBlank()) {
                    result.error(
                        ERROR_INVALID_ARGUMENT,
                        "Adresse Bluetooth manquante.",
                        null,
                    )
                    return
                }
                withPermissions(result) { performConnect(address, result) }
            }

            "disconnectDevice" -> {
                performDisconnect()
                result.success(true)
            }

            "sendRtcm" -> {
                val bytes = call.argument<ByteArray>("bytes")
                if (bytes == null) {
                    result.error(
                        ERROR_INVALID_ARGUMENT,
                        "Bloc RTCM manquant.",
                        null,
                    )
                    return
                }
                result.success(connector.send(bytes))
            }

            "startSimulation" -> {
                val assetPath = call.argument<String>("assetPath")
                if (assetPath.isNullOrBlank()) {
                    result.error(
                        ERROR_INVALID_ARGUMENT,
                        "Chemin du fichier NMEA manquant.",
                        null,
                    )
                    return
                }
                if (startSimulation(assetPath)) {
                    result.success(true)
                } else {
                    result.error(
                        ERROR_SIMULATION,
                        "Fichier NMEA de simulation illisible ou vide.",
                        null,
                    )
                }
            }

            "saveCaster" -> {
                val host = call.argument<String>("host")?.trim().orEmpty()
                val mountpoint = call.argument<String>("mountpoint")?.trim().orEmpty()
                val username = call.argument<String>("username").orEmpty()
                val password = call.argument<String>("password").orEmpty()
                val port = call.argument<Number>("port")?.toInt() ?: 0
                val useTls = call.argument<Boolean>("useTls") == true
                if (host.isEmpty() || mountpoint.isEmpty() || port !in 1..65535) {
                    result.error(
                        ERROR_INVALID_ARGUMENT,
                        "Configuration NTRIP incomplete.",
                        null,
                    )
                    return
                }
                result.success(
                    casterVault.save(
                        host = host,
                        port = port,
                        mountpoint = mountpoint,
                        username = username,
                        password = password,
                        useTls = useTls,
                    ),
                )
            }

            "loadCaster" -> result.success(casterVault.load())

            "clearCaster" -> result.success(casterVault.clear())

            else -> result.notImplemented()
        }
    }

    /// A appeler depuis `MainActivity.onRequestPermissionsResult`.
    fun onRequestPermissionsResult(requestCode: Int): Boolean {
        if (requestCode != PERMISSION_REQUEST_CODE) return false
        val call = pending ?: return true
        pending = null
        if (missingPermissions().isEmpty()) {
            call.action()
        } else {
            call.result.error(
                ERROR_PERMISSIONS,
                "Les autorisations Bluetooth sont refusees.",
                null,
            )
        }
        return true
    }

    @SuppressLint("MissingPermission")
    private fun performScan(result: MethodChannel.Result) {
        if (!connector.isEnabled()) {
            result.error(
                ERROR_BLUETOOTH,
                "Activez le Bluetooth pour rechercher le recepteur.",
                null,
            )
            return
        }
        val started = try {
            connector.startDiscovery { devices ->
                activity.runOnUiThread { result.success(devices) }
            }
        } catch (error: SecurityException) {
            result.error(ERROR_PERMISSIONS, error.message, null)
            return
        }
        if (!started) {
            result.error(
                ERROR_BLUETOOTH,
                "Recherche Bluetooth impossible.",
                null,
            )
        }
    }

    private fun performConnect(
        address: String,
        result: MethodChannel.Result,
    ) {
        stopSimulation()
        try {
            connector.connect(address) { connected, message ->
                activity.runOnUiThread {
                    if (connected) {
                        result.success(true)
                    } else {
                        result.error(
                            ERROR_BLUETOOTH,
                            message ?: "Connexion Bluetooth impossible.",
                            null,
                        )
                    }
                }
            }
        } catch (error: SecurityException) {
            result.error(ERROR_PERMISSIONS, error.message, null)
        }
    }

    private fun performDisconnect() {
        stopSimulation()
        connector.disconnect()
    }

    private fun startSimulation(assetPath: String): Boolean {
        val frames = readAsset(assetPath)
        if (frames.isEmpty()) return false

        connector.disconnect()
        stopSimulation()
        val nmeaSimulator = NmeaSimulator(
            frames = frames,
            intervalMillis = SIMULATION_INTERVAL_MS,
            onFrame = { line ->
                activity.runOnUiThread { eventSink?.success(line) }
            },
        )
        if (!nmeaSimulator.start()) {
            nmeaSimulator.stop()
            return false
        }
        simulation = true
        simulator = nmeaSimulator
        return true
    }

    private fun stopSimulation() {
        simulator?.stop()
        simulator = null
        simulation = false
    }

    private fun readAsset(path: String): List<String> {
        val candidates = listOf(path, "flutter_assets/$path")
        for (candidate in candidates) {
            try {
                activity.assets.open(candidate).bufferedReader().use { reader ->
                    val frames = NmeaScript.parse(reader.readText())
                    if (frames.isNotEmpty()) return frames
                }
            } catch (_: IOException) {
                // Essaie le candidat suivant.
            }
        }
        return emptyList()
    }

    private fun withPermissions(
        result: MethodChannel.Result,
        action: () -> Unit,
    ) {
        if (missingPermissions().isEmpty()) {
            action()
            return
        }
        if (pending != null) {
            result.error(
                ERROR_PERMISSIONS,
                "Une demande d'autorisation Bluetooth est deja en cours.",
                null,
            )
            return
        }
        pending = PendingCall(result, action)
        activity.requestPermissions(
            missingPermissions().toTypedArray(),
            PERMISSION_REQUEST_CODE,
        )
    }

    @SuppressLint("InlinedApi")
    private fun missingPermissions(): List<String> {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return emptyList()
        val required = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            listOf(
                Manifest.permission.BLUETOOTH_SCAN,
                Manifest.permission.BLUETOOTH_CONNECT,
            )
        } else {
            listOf(Manifest.permission.ACCESS_FINE_LOCATION)
        }
        return required.filter { permission ->
            activity.checkSelfPermission(permission) != PackageManager.PERMISSION_GRANTED
        }
    }
}
