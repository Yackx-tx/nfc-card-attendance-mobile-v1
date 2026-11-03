package com.amas.attendance.data.local

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "cached_roster",
    indices = [
        Index(value = ["cardUid"]),
        Index(value = ["personId"])
    ]
)
data class CachedRosterEntity(
    @PrimaryKey val personId: String,
    val externalId: String,
    val fullName: String,
    val cardUid: String,
    val rosterVersion: Int
)

@Entity(tableName = "offline_authorizations")
data class OfflineAuthorizationEntity(
    @PrimaryKey val authorizationId: String,
    val sessionId: String,
    val organizationId: String,
    val issuedAtEpochSec: Long,
    val expiresAtEpochSec: Long,
    val rosterVersion: Int,
    val rosterDigest: String,
    val signature: String
)

@Entity(
    tableName = "scan_outbox",
    indices = [
        Index(value = ["syncState"]),
        Index(value = ["sessionId", "personId"])
    ]
)
data class OutboxEntity(
    @PrimaryKey val eventId: String, // UUID v4
    val sessionId: String,
    val authorizationId: String?,
    val cardUid: String,
    val personId: String,
    val personName: String,
    val deviceWallClockTime: String,
    val monotonicElapsedMs: Long,
    val syncState: String, // PENDING_SYNC, SYNCED_ACCEPTED, SYNCED_DUPLICATE, SYNCED_REJECTED, NEEDS_REVIEW
    val syncAttemptCount: Int = 0,
    val lastError: String? = null
)
