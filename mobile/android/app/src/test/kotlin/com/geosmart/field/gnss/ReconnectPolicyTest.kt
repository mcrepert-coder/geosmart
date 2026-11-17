package com.geosmart.field.gnss

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ReconnectPolicyTest {

    @Test
    fun `un echec initial ne programme pas de reconnexion`() {
        assertFalse(
            ReconnectPolicy.shouldRetryAfterFailure(
                isReconnect = false,
                wasConnected = false,
            ),
        )
    }

    @Test
    fun `la perte d une liaison deja etablie reprogramme la reconnexion`() {
        assertTrue(
            ReconnectPolicy.shouldRetryAfterFailure(
                isReconnect = false,
                wasConnected = true,
            ),
        )
    }

    @Test
    fun `une reconnexion qui echoue retente`() {
        assertTrue(
            ReconnectPolicy.shouldRetryAfterFailure(
                isReconnect = true,
                wasConnected = false,
            ),
        )
        assertTrue(
            ReconnectPolicy.shouldRetryAfterFailure(
                isReconnect = true,
                wasConnected = true,
            ),
        )
    }
}
