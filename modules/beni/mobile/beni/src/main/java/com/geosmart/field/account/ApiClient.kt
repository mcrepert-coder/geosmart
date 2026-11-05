package com.geosmart.field.account

import android.content.Context
import com.geosmart.field.beni.module.BuildConfig
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URI

class ApiError(val status: Int, message: String): Exception(message)
class ApiClient(private val context: Context) {
 private val session = SessionStore(context)
 var baseUrl: String
  get() = context.getSharedPreferences("beni_config", 0).getString("url", "http://10.0.2.2:3000")!!
  set(value) {
   val uri = URI(value)
   require(uri.scheme == "https" || BuildConfig.DEBUG && uri.scheme == "http") { "HTTPS requis" }
   require(!uri.host.isNullOrBlank() && uri.userInfo == null && uri.query == null && uri.fragment == null) { "Adresse invalide" }
   check(context.getSharedPreferences("beni_config", 0).edit().putString("url", value.trimEnd('/')).commit())
  }
 fun request(path: String, method: String = "GET", body: JSONObject? = null, authenticated: Boolean = true): String {
  synchronized(SessionStore.companionLock) {
   val current = if (authenticated) session.load() else null
   try { return raw(path, method, body, current?.optString("accessToken")) }
   catch (e: ApiError) {
    if (e.status != 401 || current == null || !current.has("refreshToken")) throw e
    val refreshed = JSONObject(raw("/auth/refresh", "POST", JSONObject().put("refreshToken", current.getString("refreshToken")), null))
    session.save(refreshed)
    return raw(path, method, body, refreshed.getString("accessToken"))
   }
  }
 }
 private fun raw(path: String, method: String, body: JSONObject?, token: String?): String {
  val c = URI(baseUrl + path).toURL().openConnection() as HttpURLConnection
  try {
   c.requestMethod = method; c.connectTimeout = 15000; c.readTimeout = 30000
   c.setRequestProperty("Content-Type", "application/json")
   if (!token.isNullOrEmpty()) c.setRequestProperty("Authorization", "Bearer $token")
   if (body != null) { c.doOutput = true; c.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) } }
   val code = c.responseCode
   val text = (if (code in 200..299) c.inputStream else c.errorStream)?.bufferedReader()?.use { it.readText() } ?: ""
   if (code !in 200..299) throw ApiError(code, runCatching { JSONObject(text).optString("message", text) }.getOrDefault(text))
   return text
  } finally { c.disconnect() }
 }
}
