package com.geosmart.field.gnss

import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class CasterSecretCodecTest {

    private fun key(): SecretKey {
        val generator = KeyGenerator.getInstance("AES")
        generator.init(256)
        return generator.generateKey()
    }

    @Test
    fun `chiffre puis dechiffre le mot de passe`() {
        val key = key()
        val encrypted = CasterSecretCodec.encrypt("secret-caster", key)

        assertEquals(
            "secret-caster",
            CasterSecretCodec.decrypt(encrypted, key),
        )
    }

    @Test
    fun `ne laisse pas le mot de passe en clair dans le bloc`() {
        val key = key()
        val encrypted = CasterSecretCodec.encrypt("secret-caster", key)
        val text = encrypted.toString(Charsets.ISO_8859_1)

        assertNotEquals("secret-caster", text)
        assertEquals(false, text.contains("secret-caster"))
    }

    @Test
    fun `utilise un IV different a chaque chiffrement`() {
        val key = key()

        val first = CasterSecretCodec.encrypt("secret-caster", key)
        val second = CasterSecretCodec.encrypt("secret-caster", key)

        assertEquals(false, first.contentEquals(second))
    }

    @Test
    fun `refuse un bloc trop court`() {
        assertThrows(IllegalArgumentException::class.java) {
            CasterSecretCodec.decrypt(ByteArray(4), key())
        }
    }
}
