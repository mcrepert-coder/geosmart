package com.geosmart.field.gnss

/// Codes de statut du contrat `contracts/gnss-channel.md`.
enum class GnssStatus(val code: String) {
    DISCONNECTED("DISCONNECTED"),
    CONNECTING("CONNECTING"),
    CONNECTED("CONNECTED"),
    RECONNECTING("RECONNECTING"),
    ERROR("ERROR"),
}
