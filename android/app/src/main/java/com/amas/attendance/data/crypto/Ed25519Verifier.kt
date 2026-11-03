package com.amas.attendance.data.crypto

import android.util.Base64
import org.bouncycastle.crypto.params.Ed25519PublicKeyParameters
import org.bouncycastle.crypto.signers.Ed25519Signer
import java.security.MessageDigest

object Ed25519Verifier {

    /**
     * Verifies an Ed25519 signature against raw message payload and raw 32-byte public key.
     */
    fun verifySignature(
        publicKeyBytes: ByteArray,
        messagePayload: ByteArray,
        base64Signature: String
    ): Boolean {
        return try {
            val signatureBytes = Base64.decode(base64Signature, Base64.DEFAULT)
            val pubKeyParams = Ed25519PublicKeyParameters(publicKeyBytes, 0)
            val signer = Ed25519Signer()
            signer.init(false, pubKeyParams)
            signer.update(messagePayload, 0, messagePayload.size)
            signer.verifySignature(signatureBytes)
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }

    /**
     * Verifies SHA-256 digest of normalized JSON string
     */
    fun verifySha256Digest(data: String, expectedDigestHex: String): Boolean {
        return try {
            val md = MessageDigest.getInstance("SHA-256")
            val digest = md.digest(data.toByteArray(Charsets.UTF_8))
            val hexString = digest.joinToString("") { "%02x".format(it) }
            hexString.equals(expectedDigestHex, ignoreCase = true)
        } catch (e: Exception) {
            false
        }
    }
}
