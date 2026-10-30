package com.geosmart.field.gnss

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class NmeaChecksumTest {

    private val gga =
        "\$GNGGA,143200.00,0607.9152,N,00113.3686,E,4,18,0.8,24.35,M,0.0,M,1.0,0000*6B"

    @Test
    fun `accepte une phrase dont le controle de somme est juste`() {
        assertTrue(NmeaChecksum.isValid(gga))
    }

    @Test
    fun `refuse une phrase dont le controle de somme est faux`() {
        val corrupted = gga.dropLast(2) + "7A"

        assertFalse(NmeaChecksum.isValid(corrupted))
    }

    @Test
    fun `refuse une phrase sans controle de somme`() {
        assertFalse(NmeaChecksum.isValid("\$GNGGA,143200.00,0607.9152,N"))
    }

    @Test
    fun `refuse une phrase qui ne commence pas par dollar`() {
        assertFalse(NmeaChecksum.isValid("GNGGA,143200.00,0607.9152,N*00"))
    }

    @Test
    fun `calcule le corps sans prefixe ni controle de somme`() {
        assertEquals(
            "GNGGA,143200.00,0607.9152,N,00113.3686,E,4,18,0.8,24.35,M,0.0,M,1.0,0000",
            NmeaChecksum.body(gga),
        )
        assertNull(NmeaChecksum.body("GNGGA,143200.00"))
    }

    @Test
    fun `ajoute un controle de somme conforme au contrat`() {
        val body = "GNGSA,A,3,01,02,03,04,05,06,07,08,09,10,11,12,1.2,0.8,0.9"

        assertEquals(
            "\$$body*2D",
            NmeaChecksum.withChecksum(body),
        )
    }

    @Test
    fun `garde la meme valeur pour un talker different`() {
        val gn = "GNGGA,143200.00,0607.9152,N,00113.3686,E,4,18"
        val gp = "GPGGA,143200.00,0607.9152,N,00113.3686,E,4,18"

        val gnLine = NmeaChecksum.withChecksum(gn)
        val gpLine = NmeaChecksum.withChecksum(gp)

        assertTrue(NmeaChecksum.isValid(gnLine))
        assertTrue(NmeaChecksum.isValid(gpLine))
    }
}
