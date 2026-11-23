package com.geosmart.field.gnss

import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit

/// Rejoue une liste de phrases NMEA a cadence fixe (EF-105).
///
/// Le simulateur ne remplace pas le recepteur : les donnees qu'il produit
/// doivent rester annoncees comme simulees par l'interface.
class NmeaSimulator(
    private val frames: List<String>,
    private val intervalMillis: Long = 1_000L,
    private val onFrame: (String) -> Unit,
) {

    private var executor: ScheduledExecutorService? = null
    private var index = 0

    val isRunning: Boolean
        get() = executor != null

    fun start(): Boolean {
        if (frames.isEmpty()) return false
        if (executor != null) return true

        index = 0
        val service = Executors.newSingleThreadScheduledExecutor()
        executor = service
        service.scheduleAtFixedRate(
            {
                val frame = frames[index % frames.size]
                index = (index + 1) % frames.size
                try {
                    onFrame(frame)
                } catch (_: RuntimeException) {
                    // Une erreur de livraison ne doit pas arreter la simulation.
                }
            },
            0L,
            intervalMillis,
            TimeUnit.MILLISECONDS,
        )
        return true
    }

    fun stop() {
        executor?.shutdownNow()
        executor = null
    }
}
