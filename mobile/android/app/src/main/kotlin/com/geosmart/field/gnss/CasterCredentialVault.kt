package com.geosmart.field.gnss

import android.content.Context
import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey

/// Stockage local de la configuration NTRIP.
///
/// Les champs de connexion sont en preferences, le mot de passe est chiffre
/// par une cle AES du Keystore Android. Si le Keystore n'est pas disponible,
/// [save] echoue au lieu d'ecrire le mot de passe en clair.
class CasterCredentialVault(context: Context) {

    companion object {
        private const val PREFS = "geosmart_ntrip"
        private const val KEYSTORE = "AndroidKeyStore"
        private const val KEY_ALIAS = "geosmart_ntrip_password"
        private const val KEY_HOST = "host"
        private const val KEY_PORT = "port"
        private const val KEY_MOUNTPOINT = "mountpoint"
        private const val KEY_USERNAME = "username"
        private const val KEY_PASSWORD = "password"
        private const val KEY_TLS = "use_tls"
    }

    private val preferences = context.getSharedPreferences(
        PREFS,
        Context.MODE_PRIVATE,
    )

    fun save(
        host: String,
        port: Int,
        mountpoint: String,
        username: String,
        password: String,
        useTls: Boolean,
    ): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return false
        return try {
            val encrypted = CasterSecretCodec.encrypt(password, key())
            preferences.edit()
                .putString(KEY_HOST, host)
                .putInt(KEY_PORT, port)
                .putString(KEY_MOUNTPOINT, mountpoint)
                .putString(KEY_USERNAME, username)
                .putString(
                    KEY_PASSWORD,
                    Base64.encodeToString(encrypted, Base64.NO_WRAP),
                )
                .putBoolean(KEY_TLS, useTls)
                .apply()
            true
        } catch (_: Exception) {
            false
        }
    }

    fun load(): Map<String, Any>? {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return null
        val host = preferences.getString(KEY_HOST, null) ?: return null
        val mountpoint = preferences.getString(KEY_MOUNTPOINT, null) ?: return null
        val encoded = preferences.getString(KEY_PASSWORD, null) ?: return null
        return try {
            val blob = Base64.decode(encoded, Base64.NO_WRAP)
            val password = CasterSecretCodec.decrypt(blob, key())
            mapOf(
                "host" to host,
                "port" to preferences.getInt(KEY_PORT, 2101),
                "mountpoint" to mountpoint,
                "username" to (preferences.getString(KEY_USERNAME, "") ?: ""),
                "password" to password,
                "useTls" to preferences.getBoolean(KEY_TLS, false),
            )
        } catch (_: Exception) {
            null
        }
    }

    fun clear(): Boolean {
        preferences.edit().clear().apply()
        return true
    }

    private fun key(): SecretKey {
        val store = KeyStore.getInstance(KEYSTORE).apply { load(null) }
        val existing = store.getEntry(KEY_ALIAS, null)
        if (existing is KeyStore.SecretKeyEntry) return existing.secretKey

        val generator = KeyGenerator.getInstance(
            KeyProperties.KEY_ALGORITHM_AES,
            KEYSTORE,
        )
        generator.init(
            KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build(),
        )
        return generator.generateKey()
    }
}
