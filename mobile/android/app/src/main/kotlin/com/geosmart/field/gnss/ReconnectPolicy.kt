package com.geosmart.field.gnss

/// Decide si une reconnexion automatique doit etre programme apres un echec.
///
/// Le contrat (`contracts/gnss-channel.md`) veut une reconnexion quand la
/// liaison etablie tombe, pas une reprise en boucle apres un echec de la
/// premiere demande de connexion de l'operateur.
object ReconnectPolicy {

    /// Une echec entraine une nouvelle tentative seulement si la tentative
    /// etait deja une reconnexion, ou si la liaison avait ete etablie au
    /// moins une fois pour cette session.
    fun shouldRetryAfterFailure(isReconnect: Boolean, wasConnected: Boolean): Boolean {
        return isReconnect || wasConnected
    }
}
