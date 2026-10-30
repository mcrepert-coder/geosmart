package com.geosmart.field.gnss

/// Controle de somme NMEA 0183.
///
/// Une phrase valide a la forme `$TALKER,champ,...*XX`, ou `XX` est le OU
/// exclusif de tous les caracteres situes entre `$` et `*`.
object NmeaChecksum {

    /// Contenu couvert par le controle de somme, sans `$` ni `*XX`.
    fun body(sentence: String): String? {
        val trimmed = sentence.trim()
        if (!trimmed.startsWith("\$")) return null
        val star = trimmed.lastIndexOf('*')
        val end = if (star >= 0) star else trimmed.length
        if (end <= 1) return null
        return trimmed.substring(1, end)
    }

    /// Calcule le controle de somme d'un contenu de phrase.
    fun compute(body: String): Int {
        var checksum = 0
        for (character in body) {
            checksum = checksum xor character.code
        }
        return checksum
    }

    /// Vrai quand la phrase porte un controle de somme correct.
    fun isValid(sentence: String): Boolean {
        val trimmed = sentence.trim()
        val body = body(trimmed) ?: return false
        val star = trimmed.lastIndexOf('*')
        if (star < 0 || trimmed.length < star + 3) return false
        val declared = trimmed.substring(star + 1, star + 3).uppercase()
        return declared == "%02X".format(compute(body))
    }

    /// Ajoute le controle de somme a un contenu de phrase, sans `$` ni `*XX`.
    fun withChecksum(body: String): String {
        return "\$$body*%02X".format(compute(body))
    }
}
