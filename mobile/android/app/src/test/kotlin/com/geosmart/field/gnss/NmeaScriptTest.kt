package com.geosmart.field.gnss

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class NmeaScriptTest {

    private val frame = NmeaChecksum.withChecksum(
        "GNGGA,143200.00,0607.9152,N,00113.3686,E,4,18,0.8,24.35,M,0.0,M,1.0,0000",
    )

    @Test
    fun `garde les phrases valides et ignore les commentaires`() {
        val content = """
            # Simulation
            $frame

            phrase sans controle de somme
        """.trimIndent()

        assertEquals(listOf(frame), NmeaScript.parse(content))
    }

    @Test
    fun `refuse un fichier sans phrase valide`() {
        assertTrue(NmeaScript.parse("# rien\n\nGNGGA,faux").isEmpty())
    }

    @Test
    fun `le fichier livre avec l application est valide`() {
        val asset = File("src/main/assets/nmea/simulation.txt")

        assertTrue("Fichier de simulation absent", asset.exists())
        val frames = NmeaScript.parse(asset.readText())

        assertTrue(frames.size >= 10)
        assertTrue(frames.all { NmeaChecksum.isValid(it) })
        assertTrue(frames.all { it.startsWith("\$GN") || it.startsWith("\$GP") })
    }
}
