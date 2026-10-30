package com.geosmart.field.gnss

import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class NmeaSimulatorTest {

    @Test
    fun `rejoue les phrases a cadence et boucle`() {
        val frames = listOf("A", "B", "C")
        val received = CopyOnWriteArrayList<String>()
        val latch = CountDownLatch(4)
        val simulator = NmeaSimulator(
            frames = frames,
            intervalMillis = 10L,
            onFrame = {
                received.add(it)
                latch.countDown()
            },
        )

        assertTrue(simulator.start())
        assertTrue(latch.await(2, TimeUnit.SECONDS))
        simulator.stop()

        assertEquals(listOf("A", "B", "C", "A"), received.take(4))
    }

    @Test
    fun `refuse un fichier vide`() {
        val simulator = NmeaSimulator(
            frames = emptyList(),
            intervalMillis = 10L,
            onFrame = {},
        )

        assertFalse(simulator.start())
        assertFalse(simulator.isRunning)
    }

    @Test
    fun `ne demarre pas deux fois`() {
        val latch = CountDownLatch(1)
        val simulator = NmeaSimulator(
            frames = listOf("A"),
            intervalMillis = 10L,
            onFrame = { latch.countDown() },
        )

        assertTrue(simulator.start())
        assertTrue(simulator.start())
        assertTrue(latch.await(2, TimeUnit.SECONDS))

        simulator.stop()
        assertFalse(simulator.isRunning)
    }
}
