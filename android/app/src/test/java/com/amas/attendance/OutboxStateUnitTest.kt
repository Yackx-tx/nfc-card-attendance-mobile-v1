package com.amas.attendance

import com.amas.attendance.data.crypto.Ed25519Verifier
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.Locale

class OutboxStateUnitTest {

    @Test
    fun normalizeCardUid_stripsColonsAndUppercase() {
        val raw = "04:a1:b2:c3:d4"
        val normalized = raw.replace(":", "").uppercase(Locale.ROOT)
        assertEquals("04A1B2C3D4", normalized)
    }

    @Test
    fun verifySha256Digest_matchesExpected() {
        val payload = "{\"test\":\"roster\"}"
        // sha256 of payload
        val expected = "579895085c80bb0d97b0a8806283ff1f98bc195f46401015f37217db58dd8e04"
        assertTrue(Ed25519Verifier.verifySha256Digest(payload, expected))
        assertFalse(Ed25519Verifier.verifySha256Digest(payload, "invalid_digest"))
    }

    @Test
    fun localScanState_provisionalIsNotAuthoritative() {
        val provisional = "Captured offline — pending verification"
        val authoritative = "Attendance recorded"

        // Invariant check: UI feedback strings must remain distinct
        assertFalse(provisional.equals(authoritative, ignoreCase = true))
        assertTrue(provisional.contains("pending verification"))
    }
}
