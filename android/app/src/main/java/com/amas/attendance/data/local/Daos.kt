package com.amas.attendance.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update
import kotlinx.coroutines.flow.Flow

@Dao
interface RosterDao {
    @Query("SELECT * FROM cached_roster WHERE cardUid = :cardUid LIMIT 1")
    suspend fun findByCardUid(cardUid: String): CachedRosterEntity?

    @Query("SELECT * FROM cached_roster WHERE personId = :personId LIMIT 1")
    suspend fun findByPersonId(personId: String): CachedRosterEntity?

    @Query("SELECT COUNT(*) FROM cached_roster")
    suspend fun count(): Int

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(people: List<CachedRosterEntity>)

    @Query("DELETE FROM cached_roster")
    suspend fun clearAll()
}

@Dao
interface AuthorizationDao {
    @Query("SELECT * FROM offline_authorizations WHERE sessionId = :sessionId LIMIT 1")
    suspend fun getAuthorizationForSession(sessionId: String): OfflineAuthorizationEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAuthorization(auth: OfflineAuthorizationEntity)

    @Query("DELETE FROM offline_authorizations WHERE sessionId = :sessionId")
    suspend fun clearForSession(sessionId: String)
}

@Dao
interface OutboxDao {
    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insert(event: OutboxEntity): Long

    @Query("SELECT * FROM scan_outbox WHERE sessionId = :sessionId AND personId = :personId LIMIT 1")
    suspend fun findLocalScanForPerson(sessionId: String, personId: String): OutboxEntity?

    @Query("SELECT * FROM scan_outbox WHERE syncState = 'PENDING_SYNC' ORDER BY monotonicElapsedMs ASC LIMIT :limit")
    suspend fun getPendingSyncEvents(limit: Int = 50): List<OutboxEntity>

    @Query("SELECT COUNT(*) FROM scan_outbox WHERE syncState = 'PENDING_SYNC'")
    fun observePendingCount(): Flow<Int>

    @Query("SELECT COUNT(*) FROM scan_outbox WHERE syncState = 'PENDING_SYNC'")
    suspend fun getPendingCount(): Int

    @Query("SELECT * FROM scan_outbox ORDER BY deviceWallClockTime DESC")
    fun observeAllEvents(): Flow<List<OutboxEntity>>

    @Query("UPDATE scan_outbox SET syncState = :outcome, lastError = :reason WHERE eventId = :eventId")
    suspend fun updateEventOutcome(eventId: String, outcome: String, reason: String? = null)

    @Query("UPDATE scan_outbox SET syncAttemptCount = syncAttemptCount + 1, lastError = :error WHERE eventId = :eventId")
    suspend fun incrementAttemptCount(eventId: String, error: String?)
}
