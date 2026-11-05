package com.geosmart.field.map

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.view.MotionEvent
import android.view.View
import org.json.JSONObject
import kotlin.math.cos

class ParcelMap(context: Context): View(context) {
 var collection = JSONObject("{\"type\":\"FeatureCollection\",\"features\":[]}")
  set(value) { field = value; zoom = 1f; panX = 0f; panY = 0f; invalidate() }
 var status = "all"
  set(value) { field = value; invalidate() }
 private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
 private var zoom = 1f
 private var panX = 0f
 private var panY = 0f
 private var lastX = 0f
 private var lastY = 0f
 fun zoomBy(factor: Float) { zoom = (zoom * factor).coerceIn(.5f, 20f); invalidate() }
 override fun onDraw(canvas: Canvas) {
  super.onDraw(canvas); canvas.drawColor(Color.rgb(239, 246, 243))
  paint.color = Color.rgb(216, 229, 223); paint.strokeWidth = 1f
  for (x in 0..width step 50) canvas.drawLine(x.toFloat(), 0f, x.toFloat(), height.toFloat(), paint)
  for (y in 0..height step 50) canvas.drawLine(0f, y.toFloat(), width.toFloat(), y.toFloat(), paint)
  val features = collection.optJSONArray("features") ?: return
  val points = mutableListOf<Pair<Double, Double>>()
  for (i in 0 until features.length()) {
   val g = features.getJSONObject(i).getJSONObject("geometry")
   if (g.optString("type") != "Polygon") continue
   val ring = g.getJSONArray("coordinates").getJSONArray(0)
   for (j in 0 until ring.length()) { val p = ring.getJSONArray(j); points.add(p.getDouble(0) to p.getDouble(1)) }
  }
  if (points.isEmpty()) { paint.color = Color.DKGRAY; paint.textSize = 30f; canvas.drawText("Aucune parcelle en cache", 30f, 60f, paint); return }
  val left = points.minOf { it.first }; val right = points.maxOf { it.first }
  val bottom = points.minOf { it.second }; val top = points.maxOf { it.second }
  val latCorrection = cos(Math.toRadians((top + bottom) / 2)).coerceAtLeast(.01)
  val scale = minOf((width - 60).toDouble() / ((right - left) * latCorrection).coerceAtLeast(.00001), (height - 100).toDouble() / (top - bottom).coerceAtLeast(.00001)) * zoom
  fun x(lon: Double) = (width / 2 + (lon - (left + right) / 2) * latCorrection * scale + panX).toFloat()
  fun y(lat: Double) = (height / 2 - (lat - (bottom + top) / 2) * scale + panY).toFloat()
  for (i in 0 until features.length()) {
   val f = features.getJSONObject(i); val p = f.getJSONObject("properties")
   if (status != "all" && p.optString("status") != status) continue
   val g = f.getJSONObject("geometry"); if (g.optString("type") != "Polygon") continue
   val rings = g.getJSONArray("coordinates"); val path = Path().apply { fillType = Path.FillType.EVEN_ODD }
   for (r in 0 until rings.length()) { val ring = rings.getJSONArray(r); for (j in 0 until ring.length()) { val v = ring.getJSONArray(j); if (j == 0) path.moveTo(x(v.getDouble(0)), y(v.getDouble(1))) else path.lineTo(x(v.getDouble(0)), y(v.getDouble(1))) }; path.close() }
   val color = when (p.optString("status")) { "clear" -> Color.rgb(28, 140, 96); "disputed" -> Color.rgb(196, 63, 63); else -> Color.rgb(205, 147, 35) }
   paint.style = Paint.Style.FILL; paint.color = color; paint.alpha = 110; canvas.drawPath(path, paint)
   paint.style = Paint.Style.STROKE; paint.alpha = 255; paint.strokeWidth = 3f; canvas.drawPath(path, paint)
   paint.style = Paint.Style.FILL; paint.color = Color.BLACK; paint.textSize = 24f
   val first = rings.getJSONArray(0).getJSONArray(0); canvas.drawText(p.optString("id"), x(first.getDouble(0)) + 6, y(first.getDouble(1)) - 8, paint)
  }
 }
 override fun onTouchEvent(event: MotionEvent): Boolean {
  when (event.action) { MotionEvent.ACTION_DOWN -> { lastX = event.x; lastY = event.y; parent.requestDisallowInterceptTouchEvent(true) }; MotionEvent.ACTION_MOVE -> { panX += event.x - lastX; panY += event.y - lastY; lastX = event.x; lastY = event.y; invalidate() }; MotionEvent.ACTION_UP -> { performClick(); parent.requestDisallowInterceptTouchEvent(false) } }
  return true
 }
 override fun performClick(): Boolean { super.performClick(); return true }
}
