package com.geosmart.field.account

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import org.json.JSONObject
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

class SessionStore(context: Context) {
 private val prefs = context.getSharedPreferences("beni_session", Context.MODE_PRIVATE)
 private val lock = companionLock
 private fun key(): SecretKey {
  val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
  (store.getKey("beni.session", null) as? SecretKey)?.let { return it }
  return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
   init(KeyGenParameterSpec.Builder("beni.session", KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
  }.generateKey()
 }
 fun save(session: JSONObject) = synchronized(lock) {
  val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, key()) }
  val encrypted = cipher.doFinal(session.toString().toByteArray(Charsets.UTF_8))
  check(prefs.edit().putString("iv", Base64.encodeToString(cipher.iv, Base64.NO_WRAP)).putString("data", Base64.encodeToString(encrypted, Base64.NO_WRAP)).commit())
 }
 fun load(): JSONObject? = synchronized(lock) {
  val data = prefs.getString("data", null) ?: return null
  val iv = Base64.decode(prefs.getString("iv", null), Base64.NO_WRAP)
  val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, iv)) }
  JSONObject(String(cipher.doFinal(Base64.decode(data, Base64.NO_WRAP)), Charsets.UTF_8))
 }
 fun clear() = synchronized(lock) { check(prefs.edit().clear().commit()) }
 companion object { val companionLock = Any() }
}
