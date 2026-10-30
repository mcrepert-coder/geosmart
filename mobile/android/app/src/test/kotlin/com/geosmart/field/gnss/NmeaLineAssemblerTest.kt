package com.geosmart.field.gnss

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class NmeaLineAssemblerTest {

    private val gga = NmeaChecksum.withChecksum(
        "GNGGA,143200.00,0607.9152,N,00113.3686,E,4,18,0.8,24.35,M,0.0,M,1.0,0000",
    )
    private val gsa = NmeaChecksum.withChecksum(
        "GNGSA,A,3,01,02,03,04,05,06,07,08,09,10,11,12,1.2,0.8,0.9",
    )

    @Test
    fun `recompose une phrase coupee en deux paquets`() {
        val assembler = NmeaLineAssembler()

        assertTrue(assembler.feed(gga.substring(0, 20)).isEmpty())
        assertEquals(listOf(gga), assembler.feed(gga.substring(20) + "\r\n"))
    }

    @Test
    fun `renvoie plusieurs phrases dans un seul paquet`() {
        val assembler = NmeaLineAssembler()

        assertEquals(
            listOf(gga, gsa),
            assembler.feed("$gga\r\n$gsa\r\n"),
        )
    }

    @Test
    fun `ignore les lignes vides`() {
        val assembler = NmeaLineAssembler()

        assertEquals(listOf(gga), assembler.feed("\r\n$gga\r\n\r\n"))
    }

    @Test
    fun `reprend apres une phrase sans separateur final`() {
        val assembler = NmeaLineAssembler()

        assertEquals(emptyList<String>(), assembler.feed(gga))
        assertEquals(listOf(gga), assembler.feed("\r\n"))
        assertEquals(listOf(gsa), assembler.feed("$gsa\r\n"))
    }

    @Test
    fun `vide le tampon sur demande`() {
        val assembler = NmeaLineAssembler()
        assembler.feed("\$GNGGA,coupe")

        assembler.reset()

        assertEquals(listOf(gga), assembler.feed("$gga\r\n"))
    }

    @Test
    fun `borne le tampon pour ne pas grossir sans fin`() {
        val assembler = NmeaLineAssembler(maxBufferLength = 128)

        assertTrue(assembler.feed("x".repeat(300)).isEmpty())
        // La fin de la ligne trop longue est jetee jusqu'au separateur.
        assertTrue(assembler.feed("\r\n").isEmpty())
        assertEquals(listOf(gga), assembler.feed("$gga\r\n"))
    }
}
