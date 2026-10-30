package com.geosmart.field.gnss

/// Recompose les phrases NMEA recues par morceaux sur la socket Bluetooth.
///
/// Le flux serie n'arrive pas forcement ligne par ligne : un paquet peut
/// contenir une demi-phrase, ou plusieurs phrases. L'assembleur garde le
/// reliquat jusqu'au prochain separateur.
class NmeaLineAssembler(private val maxBufferLength: Int = 4096) {

    private val buffer = StringBuilder()
    private var discarding = false

    /// Ajoute un morceau de flux et renvoie les phrases completes.
    fun feed(chunk: String): List<String> {
        val lines = mutableListOf<String>()
        for (character in chunk) {
            when (character) {
                '\r', '\n' -> flush(lines)
                else -> {
                    if (discarding) continue
                    buffer.append(character)
                    if (buffer.length > maxBufferLength) {
                        buffer.setLength(0)
                        discarding = true
                    }
                }
            }
        }
        return lines
    }

    /// Vide le tampon, par exemple apres une reconnexion.
    fun reset() {
        buffer.setLength(0)
        discarding = false
    }

    private fun flush(lines: MutableList<String>) {
        val line = buffer.toString().trim()
        buffer.setLength(0)
        if (!discarding && line.isNotEmpty()) {
            lines.add(line)
        }
        discarding = false
    }
}
