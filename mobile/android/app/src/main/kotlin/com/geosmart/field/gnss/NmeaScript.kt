package com.geosmart.field.gnss

/// Lecture d'un fichier NMEA de simulation.
///
/// Le fichier peut contenir des commentaires commencant par `#` et des lignes
/// vides. Seules les phrases dont le controle de somme est correct sont
/// conservees : une phrase fausse ne doit pas produire une position fausse.
object NmeaScript {

    fun parse(content: String): List<String> {
        return content.lineSequence()
            .map { it.trim() }
            .filter { it.isNotEmpty() && !it.startsWith("#") }
            .filter { NmeaChecksum.isValid(it) }
            .toList()
    }
}
