package com.geosmart.field.sync

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import com.geosmart.field.account.ApiClient
import com.geosmart.field.account.SessionStore
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

class OfflineQueue(private val context: Context): SQLiteOpenHelper(context, "beni_queue.db", null, 2) {
 override fun onCreate(db: SQLiteDatabase) {
  db.execSQL("CREATE TABLE queue (client_id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, type TEXT NOT NULL, payload TEXT NOT NULL, state TEXT NOT NULL, reason TEXT, entity_id TEXT, created_at INTEGER NOT NULL)")
  db.execSQL("CREATE TABLE cache (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
 }
 override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
  if (oldVersion < 2) db.execSQL("UPDATE queue SET state='rejected', reason='LEGACY_POINT_SYNC_UNSUPPORTED' WHERE type <> 'survey_session' AND state='pending'")
 }
 fun enqueue(type: String, payload: JSONObject): String {
  require(type == "survey_session") { "Synchroniser une mission complete avec entityType survey_session" }
  val owner = SessionStore(context).load()?.getJSONObject("user")?.getString("id") ?: error("Connexion requise avant saisie")
  val id = UUID.randomUUID().toString()
  writableDatabase.insertOrThrow("queue", null, ContentValues().apply {
   put("client_id", id); put("owner_id", owner); put("type", type); put("payload", payload.toString()); put("state", "pending"); put("created_at", System.currentTimeMillis())
  })
  SyncJob.schedule(context)
  return id
 }
 fun list(): JSONArray {
  val owner = SessionStore(context).load()?.optJSONObject("user")?.optString("id") ?: return JSONArray()
  val items = JSONArray()
  readableDatabase.query("queue", null, "owner_id=?", arrayOf(owner), null, null, "created_at").use { c ->
   while (c.moveToNext()) items.put(JSONObject().put("clientId", c.getString(c.getColumnIndexOrThrow("client_id"))).put("entityType", c.getString(c.getColumnIndexOrThrow("type"))).put("payload", JSONObject(c.getString(c.getColumnIndexOrThrow("payload")))).put("state", c.getString(c.getColumnIndexOrThrow("state"))).put("reason", c.getString(c.getColumnIndexOrThrow("reason"))).put("entityId", c.getString(c.getColumnIndexOrThrow("entity_id"))))
  }
  return items
 }
 fun sync(): Int = synchronized(syncLock) {
  val all = list(); val batch = JSONArray()
  for (i in 0 until all.length()) { val item = all.getJSONObject(i); if (item.getString("state") == "pending" && batch.length() < 20) batch.put(JSONObject().put("clientId", item.getString("clientId")).put("entityType", item.getString("entityType")).put("payload", item.getJSONObject("payload"))) }
  if (batch.length() == 0) return 0
  val results = JSONObject(ApiClient(context).request("/sync", "POST", JSONObject().put("items", batch))).getJSONArray("results")
  writableDatabase.beginTransaction()
  try {
   for (i in 0 until results.length()) {
    val result = results.getJSONObject(i)
    val state = if (result.getString("status") == "accepted") "accepted" else if (result.optBoolean("retryable")) "pending" else "rejected"
    writableDatabase.update("queue", ContentValues().apply { put("state", state); put("reason", result.optString("reason", "")); put("entity_id", result.optString("entityId", "")) }, "client_id=?", arrayOf(result.getString("clientId")))
   }
   writableDatabase.setTransactionSuccessful()
  } finally { writableDatabase.endTransaction() }
  results.length()
 }
 fun hasPending(): Boolean { val items = list(); return (0 until items.length()).any { items.getJSONObject(it).getString("state") == "pending" } }
 fun cache(key: String, value: String) { writableDatabase.insertWithOnConflict("cache", null, ContentValues().apply { put("key", key); put("value", value) }, SQLiteDatabase.CONFLICT_REPLACE) }
 fun cached(key: String): String? { readableDatabase.query("cache", arrayOf("value"), "key=?", arrayOf(key), null, null, null).use { c -> return if (c.moveToFirst()) c.getString(0) else null } }
 companion object { private val syncLock = Any() }
}
