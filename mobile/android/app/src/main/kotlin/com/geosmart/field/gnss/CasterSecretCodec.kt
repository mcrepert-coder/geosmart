package com.geosmart.field.gnss

import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/// Chiffrement AES-GCM du mot de passe du caster NTRIP.
///
/// Le format produit est `IV (12 octets) || texte chiffre || tag GCM`. La cle
/// reste dans le Keystore Android ; ce code pur se teste en JVM.
object CasterSecretCodec {

    private const val TRANSFORMATION = "AES/GCM/NoPadding"
    private const val IV_BYTES = 12
    private const val TAG_BITS = 128

    fun encrypt(plaintext: String, key: SecretKey): ByteArray {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        val iv = ByteArray(IV_BYTES).also { SecureRandom().nextBytes(it) }
        cipher.init(Cipher.ENCRYPT_MODE, key, GCMParameterSpec(TAG_BITS, iv))
        val encrypted = cipher.doFinal(plaintext.toByteArray(Charsets.UTF_8))
        return iv + encrypted
    }

    fun decrypt(blob: ByteArray, key: SecretKey): String {
        require(blob.size > IV_BYTES) { "Bloc chiffre invalide." }
        val iv = blob.copyOfRange(0, IV_BYTES)
        val encrypted = blob.copyOfRange(IV_BYTES, blob.size)
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(TAG_BITS, iv))
        return String(cipher.doFinal(encrypted), Charsets.UTF_8)
    }
}
