package com.geosmart.geosmart_mobile

import com.geosmart.field.gnss.GnssChannelHost
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.EventChannel
import io.flutter.plugin.common.MethodChannel

/// Point d'entree Android : branche le pont GNSS du contrat
/// `contracts/gnss-channel.md` sur le moteur Flutter.
class MainActivity : FlutterActivity() {

    private var gnssHost: GnssChannelHost? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        val messenger = flutterEngine.dartExecutor.binaryMessenger
        gnssHost = GnssChannelHost(
            activity = this,
            methodChannel = MethodChannel(
                messenger,
                GnssChannelHost.METHOD_CHANNEL,
            ),
            eventChannel = EventChannel(
                messenger,
                GnssChannelHost.EVENT_CHANNEL,
            ),
        ).also { it.attach() }
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<String>,
        grantResults: IntArray,
    ) {
        if (gnssHost?.onRequestPermissionsResult(requestCode) == true) return
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
    }

    override fun onDestroy() {
        gnssHost?.detach()
        gnssHost = null
        super.onDestroy()
    }
}
