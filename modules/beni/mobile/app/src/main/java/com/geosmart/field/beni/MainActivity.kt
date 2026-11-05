package com.geosmart.field.beni

import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.text.InputType
import android.util.Base64
import android.view.View
import android.widget.*
import com.geosmart.field.account.ApiClient
import com.geosmart.field.account.SessionStore
import com.geosmart.field.map.ParcelMap
import com.geosmart.field.sync.OfflineQueue
import com.geosmart.field.sync.SyncJob
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.util.concurrent.Executors

class MainActivity: Activity() {
 private lateinit var panel: LinearLayout
 private lateinit var output: TextView
 private val executor = Executors.newSingleThreadExecutor()
 private val session by lazy { SessionStore(this) }
 private val api by lazy { ApiClient(this) }
 private var documentType = "identity"
 private val green = Color.rgb(18, 98, 76)
 override fun onCreate(state: Bundle?) { super.onCreate(state); home(); SyncJob.schedule(this) }
 private fun page(title: String) {
  val scroll = ScrollView(this)
  panel = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(28, 58, 28, 32); setBackgroundColor(Color.rgb(246, 249, 247)) }
  scroll.addView(panel); setContentView(scroll)
  label("GEOSMART  /  MODULE BENI", 13f, green); label(title, 27f)
  output = TextView(this).apply { setTextColor(Color.DKGRAY); setTextIsSelectable(true); textSize = 14f; setPadding(0, 16, 0, 16) }
 }
 private fun label(text: String, size: Float = 16f, color: Int = Color.rgb(25, 42, 36)): TextView {
  val v = TextView(this).apply { this.text = text; textSize = size; setTextColor(color); setPadding(0, 8, 0, 10) }; panel.addView(v); return v
 }
 private fun input(hint: String, password: Boolean = false): EditText {
  val v = EditText(this).apply { this.hint = hint; textSize = 16f; isSingleLine = true; if (password) inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD }; panel.addView(v); return v
 }
 private fun button(text: String, action: () -> Unit) { panel.addView(Button(this).apply { this.text = text; isAllCaps = false; setOnClickListener { action() } }) }
 private fun finishPage() { panel.addView(output); button("Accueil") { home() } }
 private fun work(task: () -> String) {
  val target = output; target.text = "Traitement en cours..."
  executor.execute { val result = runCatching(task).getOrElse { "Erreur : ${it.message}" }; runOnUiThread { target.text = result } }
 }
 private fun home() {
  page("Votre espace terrain")
  val user = runCatching { session.load()?.optJSONObject("user") }.getOrNull()
  label(if (user == null) "Connectez-vous pour acceder a votre espace." else "${user.optString("name")} - ${user.optString("role")}\nCompte : ${user.optString("status")}\n${if (user.optBoolean("certified")) "Professionnel certifie" else "Non certifie"}")
  button("Carte des parcelles") { map() }
  if (user == null) { button("Connexion") { login() }; button("Creer un compte") { register() }; button("Verifier mon code") { verify() } }
  else {
   button("Mon compte et mes justificatifs") { account() }
   if (user.optString("status") == "active") {
    if (user.optString("role") in listOf("GEOMETRE", "TOPOGRAPHE")) { button("Mission complete hors ligne") { survey() }; button("Synchronisation") { sync() } }
    if (user.optString("role") == "ADMIN") button("Administration") { admin() }
   }
   button("Deconnexion") { work { val s = session.load(); try { if (s?.has("refreshToken") == true) api.request("/auth/logout", "POST", JSONObject().put("refreshToken", s.getString("refreshToken"))) } finally { session.clear(); runOnUiThread { home() } }; "Session fermee" } }
  }
  button("Adresse du serveur") { settings() }
  panel.addView(output)
 }
 private fun settings() {
  page("Connexion au serveur"); val url = input("https://serveur").apply { setText(api.baseUrl) }
  label("Emulateur Android : http://10.0.2.2:3000 en version de test. Pour un telephone : serveur HTTPS accessible.")
  button("Enregistrer") { runCatching { api.baseUrl = url.text.toString().trim(); output.text = "Adresse enregistree" }.onFailure { output.text = it.message } }
  finishPage()
 }
 private fun login() {
  page("Connexion"); val phone = input("Telephone : +228..."); val password = input("Mot de passe", true)
  button("Se connecter") { val p = phone.text.toString(); val pass = password.text.toString(); work { val s = JSONObject(api.request("/auth/login", "POST", JSONObject().put("phone", p).put("password", pass), false)); session.save(s); SyncJob.schedule(this); runOnUiThread { home() }; "Connecte" } }
  finishPage()
 }
 private fun register() {
  page("Creer un compte"); val name = input("Nom complet"); val phone = input("Telephone : +228..."); val password = input("Mot de passe : 12 caracteres minimum", true)
  label("Le compte doit etre valide par un administrateur. Le role professionnel est attribue apres verification des pieces.")
  button("S'inscrire") { val p = JSONObject().put("name", name.text.toString()).put("phone", phone.text.toString()).put("password", password.text.toString()); work { api.request("/auth/register", "POST", p, false); "Compte cree. Saisissez le code de verification. En demonstration, le code est affiche dans le terminal du serveur." } }
  button("Saisir le code") { verify() }; finishPage()
 }
 private fun verify() {
  page("Verifier le telephone"); val phone = input("Telephone : +228..."); val code = input("Code de 6 chiffres")
  button("Verifier") { val p = JSONObject().put("phone", phone.text.toString()).put("code", code.text.toString()); work {
   val result = JSONObject(api.request("/auth/verify", "POST", p, false)); session.save(JSONObject().put("accessToken", result.getString("onboardingToken")))
   val me = JSONObject(api.request("/users/me")); val s = session.load()!!; s.put("user", me); session.save(s)
   runOnUiThread { account() }; "Telephone verifie"
  } }; finishPage()
 }
 private fun account() {
  page("Compte et justificatifs")
  label("Formats : JPEG, PNG ou PDF. Maximum : 5 Mo. Acces reserve au titulaire et a l'administration.")
  button("Actualiser mon compte") { work { val me = JSONObject(api.request("/users/me")); val s = session.load()!!; s.put("user", me); session.save(s); me.toString(2) } }
  button("Mes justificatifs") { work { JSONArray(api.request("/users/me/documents")).toString(2) } }
  button("Ajouter un justificatif") {
   val values = arrayOf("identity", "professional", "rccm", "approval", "order")
   AlertDialog.Builder(this).setTitle("Type de piece").setItems(arrayOf("Identite", "Carte professionnelle", "RCCM", "Agrement", "Inscription a l'Ordre")) { _, i -> documentType = values[i]; startActivityForResult(Intent(Intent.ACTION_OPEN_DOCUMENT).apply { type = "*/*"; addCategory(Intent.CATEGORY_OPENABLE); putExtra(Intent.EXTRA_MIME_TYPES, arrayOf("image/jpeg", "image/png", "application/pdf")) }, 42) }.show()
  }
  label("Si le compte vient d'etre valide, reconnectez-vous pour obtenir une session complete.")
  button("Connexion") { login() }; finishPage()
 }
 @Deprecated("Compatibilite Activity native")
 override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
  super.onActivityResult(requestCode, resultCode, data)
  if (requestCode != 42 || resultCode != RESULT_OK) return
  val uri = data?.data ?: return
  val type = documentType
  work {
   val bytes = contentResolver.openInputStream(uri)!!.use { stream ->
    val buffer = ByteArray(8192); val result = java.io.ByteArrayOutputStream()
    while (true) { val n = stream.read(buffer); if (n < 0) break; require(result.size() + n <= 5 * 1024 * 1024) { "Fichier superieur a 5 Mo" }; result.write(buffer, 0, n) }; result.toByteArray()
   }
   val body = JSONObject().put("type", type).put("mime", contentResolver.getType(uri)).put("base64", Base64.encodeToString(bytes, Base64.NO_WRAP)); api.request("/users/me/documents", "POST", body); "Justificatif ajoute"
  }
 }
 private fun survey() {
  page("Mission complete hors ligne")
  label("Une mission est envoyee en un seul element survey_session. Le JSON ci-dessous est une fixture de demonstration, a remplacer par le payload convenu avec Romuald. Aucun POST /parcels n'est effectue ici.")
  val points = JSONArray()
  for ((lat, lon) in listOf(6.13 to 1.20, 6.131 to 1.20, 6.13 to 1.201)) points.put(JSONObject().put("latitude", lat).put("longitude", lon).put("fix", "fixed").put("accuracy", .02).put("satellites", 20).put("recordedAt", Instant.now().toString()))
  val fixture = JSONObject().put("schemaVersion", "demo-v1").put("sessionId", java.util.UUID.randomUUID().toString()).put("name", "Mission fictive").put("status", "completed").put("points", points)
  val payload = input("Mission complete au format JSON").apply { isSingleLine = false; minLines = 8; setText(fixture.toString(2)) }
  button("Conserver la mission complete en SQLite") {
   runCatching { val p = JSONObject(payload.text.toString()); OfflineQueue(this).use { it.enqueue("survey_session", p) } }.onSuccess { output.text = "Mission complete sauvegardee : $it" }.onFailure { output.text = "Erreur : ${it.message}" }
  }
  button("Voir la file") { sync() }; finishPage()
 }
 private fun sync() {
  page("Synchronisation")
  label("Les donnees restent sur cet appareil. Les refus conservent leur motif. Les erreurs temporaires sont reessayees automatiquement.")
  button("Afficher la file locale") { work { OfflineQueue(this).use { it.list().toString(2) } } }
  button("Synchroniser maintenant") { work { OfflineQueue(this).use { q -> val n = q.sync(); "Resultats traites : $n\n" + q.list().toString(2) } } }
  finishPage()
 }
 private fun admin() {
  page("Administration")
  button("Comptes et statuts") { work { JSONArray(api.request("/admin/users")).toString(2) } }
  button("Justificatifs disponibles") { work { JSONArray(api.request("/admin/documents")).toString(2) } }
  val id = input("Identifiant du compte")
  val roles = arrayOf("CLIENT", "AGENT_IMMOBILIER", "GEOMETRE", "TOPOGRAPHE", "ADMIN")
  val role = Spinner(this).apply { adapter = ArrayAdapter(this@MainActivity, android.R.layout.simple_spinner_dropdown_item, arrayOf("Client", "Agent immobilier", "Geometre", "Topographe", "Administrateur")) }; panel.addView(role)
  val certified = CheckBox(this).apply { text = "Professionnel certifie apres verification" }; panel.addView(certified)
  val fullName = input("Nom complet du geometre (maximum 120 caracteres)")
  val ordreNumber = input("Numero inscription Ordre (maximum 40 caracteres)")
  button("Valider ce compte") { val p = JSONObject().put("action", "approve").put("role", roles[role.selectedItemPosition]).put("certified", certified.isChecked); if (fullName.text.isNotBlank()) p.put("fullName", fullName.text.toString()); if (ordreNumber.text.isNotBlank()) p.put("ordreNumber", ordreNumber.text.toString()); val userId = id.text.toString(); work { JSONObject(api.request("/admin/users/$userId", "PATCH", p)).toString(2) } }
  val reason = input("Motif du rejet ou de la suspension")
  for ((title, action) in listOf("Rejeter" to "reject", "Suspendre" to "suspend")) button(title) { val userId = id.text.toString(); val p = JSONObject().put("action", action).put("reason", reason.text.toString()); work { api.request("/admin/users/$userId", "PATCH", p) } }
  button("Journal des actions") { work { JSONArray(api.request("/admin/logs")).toString(2) } }; finishPage()
 }
 private fun map() {
  page("Carte des parcelles")
  label("Vue des polygones WGS84 en lecture seule. Vert : sans conflit signale ; orange : en attente ; rouge : litige. Cette vue ne constitue pas une preuve juridique.")
  val map = ParcelMap(this); panel.addView(map, LinearLayout.LayoutParams(-1, 700))
  OfflineQueue(this).use { q -> q.cached("map:" + api.baseUrl)?.let { runCatching { map.collection = JSONObject(it) } } }
  val filters = arrayOf("all", "clear", "pending", "disputed")
  val filter = Spinner(this).apply { adapter = ArrayAdapter(this@MainActivity, android.R.layout.simple_spinner_dropdown_item, arrayOf("Tous", "Sans conflit signale", "En attente", "Litige")) }
  filter.onItemSelectedListener = object: AdapterView.OnItemSelectedListener { override fun onItemSelected(p: AdapterView<*>?, v: View?, position: Int, id: Long) { map.status = filters[position] }; override fun onNothingSelected(p: AdapterView<*>?) {} }; panel.addView(filter)
  button("Zoom +") { map.zoomBy(1.4f) }; button("Zoom -") { map.zoomBy(1 / 1.4f) }
  button("Actualiser et conserver hors ligne") { work { val text = api.request("/map/parcels", authenticated = false); val geo = JSONObject(text); OfflineQueue(this).use { it.cache("map:" + api.baseUrl, text) }; runOnUiThread { map.collection = geo }; if (geo.optBoolean("demo")) "DONNEES FICTIVES DE DEMONSTRATION" else "Carte actualisee et disponible hors ligne" } }
  finishPage()
 }
 override fun onDestroy() { executor.shutdown(); super.onDestroy() }
}
