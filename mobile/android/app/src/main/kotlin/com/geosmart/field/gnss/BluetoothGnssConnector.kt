package com.geosmart.field.gnss

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothSocket
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import java.io.IOException
import java.io.OutputStream
import java.util.UUID
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit

/// Liaison Bluetooth SPP avec le recepteur GNSS.
///
/// La classe ne gere ni permissions ni interface : elle ouvre la socket,
/// rejoue les phrases NMEA valides et tente une reconnexion automatique avec
/// un delai croissant quand la liaison tombe.
class BluetoothGnssConnector(
    private val context: Context,
    private val listener: Listener,
) {

    interface Listener {
        fun onNmea(line: String)
        fun onStatus(status: GnssStatus, detail: String?)
    }

    companion object {
        val SPP_UUID: UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")

        private const val BASE_RECONNECT_DELAY_MS = 2_000L
        private const val MAX_RECONNECT_DELAY_MS = 30_000L
        private const val MAX_RECONNECT_SHIFT = 4
        private const val DISCOVERY_DURATION_MS = 8_000L
        private const val READ_BUFFER_SIZE = 1024
    }

    private val adapter: BluetoothAdapter?
        get() = (context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager)
            ?.adapter

    private val ioExecutor = Executors.newSingleThreadExecutor()
    private val reconnectExecutor: ScheduledExecutorService =
        Executors.newSingleThreadScheduledExecutor()
    private val discoveryExecutor: ScheduledExecutorService =
        Executors.newSingleThreadScheduledExecutor()
    private val assembler = NmeaLineAssembler()

    @Volatile private var socket: BluetoothSocket? = null
    @Volatile private var output: OutputStream? = null
    @Volatile private var connectedAddress: String? = null
    @Volatile private var shouldReconnect = false
    @Volatile private var reconnectAttempt = 0
    @Volatile private var closed = false
    @Volatile private var reconnectFuture: ScheduledFuture<*>? = null
    @Volatile private var connecting = false

    fun isEnabled(): Boolean = adapter?.isEnabled == true

    @SuppressLint("MissingPermission")
    fun bondedDevices(): List<Map<String, Any>> {
        val current = adapter ?: return emptyList()
        return current.bondedDevices
            .map { device ->
                mapOf(
                    "name" to (device.name ?: "Recepteur inconnu"),
                    "address" to device.address,
                    "isBonded" to true,
                )
            }
            .sortedBy { it["name"] as String }
    }

    /// Recherche les appareils appaires puis a proximite, pendant huit
    /// secondes. Le rappel recoit la liste complete une seule fois.
    @SuppressLint("MissingPermission")
    fun startDiscovery(onDevices: (List<Map<String, Any>>) -> Unit): Boolean {
        val current = adapter ?: return false
        if (!current.isEnabled) return false

        val found = linkedMapOf<String, Map<String, Any>>()
        for (device in bondedDevices()) {
            found[device["address"] as String] = device
        }

        val receiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context?, intent: Intent?) {
                if (intent?.action != BluetoothDevice.ACTION_FOUND) return
                val device = intent.getParcelableExtra<android.bluetooth.BluetoothDevice>(
                    BluetoothDevice.EXTRA_DEVICE,
                ) ?: return
                val address = device.address
                found[address] = mapOf(
                    "name" to (device.name ?: "Recepteur inconnu"),
                    "address" to address,
                    "isBonded" to (device.bondState == android.bluetooth.BluetoothDevice.BOND_BONDED),
                )
            }
        }

        context.registerReceiver(receiver, IntentFilter(BluetoothDevice.ACTION_FOUND))
        try {
            if (current.isDiscovering) current.cancelDiscovery()
            current.startDiscovery()
        } catch (_: SecurityException) {
            context.unregisterReceiver(receiver)
            return false
        }

        discoveryExecutor.schedule(
            {
                try {
                    if (current.isDiscovering) current.cancelDiscovery()
                } catch (_: SecurityException) {
                    // La decouverte s'arrete d'elle-meme.
                }
                try {
                    context.unregisterReceiver(receiver)
                } catch (_: IllegalArgumentException) {
                    // Deja retire.
                }
                onDevices(found.values.toList())
            },
            DISCOVERY_DURATION_MS,
            TimeUnit.MILLISECONDS,
        )
        return true
    }

    /// Ouvre la socket SPP. Le rappel est appele une seule fois, sur le fil
    /// d'entree sortie : l'appelant doit revenir sur le fil principal.
    @SuppressLint("MissingPermission")
    fun connect(address: String, onResult: (Boolean, String?) -> Unit) {
        open(address, onResult, isReconnect = false)
    }

    @SuppressLint("MissingPermission")
    private fun open(
        address: String,
        onResult: (Boolean, String?) -> Unit,
        isReconnect: Boolean,
    ) {
        val current = adapter
        if (current == null) {
            onResult(false, "Bluetooth indisponible sur cet appareil.")
            return
        }
        if (!current.isEnabled) {
            onResult(false, "Activez le Bluetooth pour connecter le recepteur.")
            return
        }
        if (connecting) {
            onResult(false, "Connexion deja en cours.")
            return
        }

        val device = try {
            current.getRemoteDevice(address)
        } catch (_: IllegalArgumentException) {
            onResult(false, "Adresse Bluetooth invalide.")
            return
        }

        connecting = true
        shouldReconnect = true
        closed = false
        connectedAddress = address
        if (!isReconnect) {
            reconnectAttempt = 0
        }
        listener.onStatus(GnssStatus.CONNECTING, null)

        ioExecutor.execute {
            closeSocket()
            val candidate = try {
                device.createRfcommSocketToServiceRecord(SPP_UUID)
            } catch (error: IOException) {
                connecting = false
                listener.onStatus(GnssStatus.ERROR, error.message)
                onResult(false, error.message ?: "Socket Bluetooth impossible.")
                return@execute
            }

            try {
                try {
                    current.cancelDiscovery()
                } catch (_: SecurityException) {
                    // Sans effet sur la connexion.
                }
                candidate.connect()
            } catch (error: IOException) {
                closeQuietly(candidate)
                connecting = false
                listener.onStatus(GnssStatus.RECONNECTING, error.message)
                onResult(false, error.message ?: "Connexion Bluetooth refusee.")
                scheduleReconnect(address)
                return@execute
            }

            socket = candidate
            output = candidate.outputStream
            assembler.reset()
            connecting = false
            reconnectAttempt = 0
            listener.onStatus(GnssStatus.CONNECTED, null)
            onResult(true, null)
            readLoop(candidate)
        }
    }

    /// Ecrit un bloc RTCM sur la socket, si elle est ouverte.
    fun send(bytes: ByteArray): Boolean {
        val stream = output ?: return false
        return try {
            synchronized(stream) {
                stream.write(bytes)
                stream.flush()
            }
            true
        } catch (_: IOException) {
            false
        }
    }

    fun isConnected(): Boolean = socket?.isConnected == true

    /// Ferme la liaison sans empecher une connexion ulterieure.
    fun disconnect() {
        shouldReconnect = false
        cancelReconnect()
        closeSocket()
        listener.onStatus(GnssStatus.DISCONNECTED, null)
    }

    /// Ferme la liaison et libere les fils d'execution.
    fun close() {
        closed = true
        shouldReconnect = false
        cancelReconnect()
        reconnectExecutor.shutdownNow()
        discoveryExecutor.shutdownNow()
        closeSocket()
        ioExecutor.shutdownNow()
    }

    private fun readLoop(current: BluetoothSocket) {
        val buffer = ByteArray(READ_BUFFER_SIZE)
        try {
            val input = current.inputStream
            while (!closed) {
                val read = input.read(buffer)
                if (read < 0) break
                val chunk = String(buffer, 0, read, Charsets.US_ASCII)
                for (line in assembler.feed(chunk)) {
                    if (NmeaChecksum.isValid(line)) {
                        listener.onNmea(line)
                    }
                }
            }
        } catch (_: IOException) {
            // Traite comme une perte de liaison.
        } finally {
            if (socket === current) {
                socket = null
                output = null
            }
            if (shouldReconnect && !closed) {
                scheduleReconnect(connectedAddress)
            }
        }
    }

    private fun scheduleReconnect(address: String?) {
        if (address == null || !shouldReconnect || closed) return
        cancelReconnect()
        reconnectAttempt += 1
        val shift = (reconnectAttempt - 1).coerceIn(0, MAX_RECONNECT_SHIFT)
        val delay = (BASE_RECONNECT_DELAY_MS shl shift).coerceAtMost(MAX_RECONNECT_DELAY_MS)
        listener.onStatus(
            GnssStatus.RECONNECTING,
            "Nouvelle tentative dans ${delay / 1000} s.",
        )
        reconnectFuture = reconnectExecutor.schedule(
            {
                if (shouldReconnect && !closed) {
                    open(address, { _, _ -> }, isReconnect = true)
                }
            },
            delay,
            TimeUnit.MILLISECONDS,
        )
    }

    private fun cancelReconnect() {
        reconnectFuture?.cancel(false)
        reconnectFuture = null
    }

    private fun closeSocket() {
        val current = socket
        socket = null
        output = null
        if (current != null) {
            closeQuietly(current)
        }
    }

    private fun closeQuietly(target: BluetoothSocket) {
        try {
            target.close()
        } catch (_: IOException) {
            // Rien a faire.
        }
    }
}
