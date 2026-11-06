package com.amas.attendance.data.repository

import android.content.Context
import android.os.SystemClock
import androidx.work.Constraints
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import com.amas.attendance.data.local.AmasDatabase
import com.amas.attendance.data.local.CachedRosterEntity
import com.amas.attendance.data.local.OfflineAuthorizationEntity
import com.amas.attendance.data.local.OutboxEntity
import com.amas.attendance.data.sync.SyncWorker
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.withContext
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.UUID

sealed class LocalScanResult {
    data class CapturedOffline(val personName: String, val message: String = "Captured offline — pending verification") : LocalScanResult()
    data class AlreadyRecorded(val personName: String, val recordedTime: String) : LocalScanResult()
    data class CardNotRegistered(val cardUid: String) : LocalScanResult()
    data class AuthorizationExpired(val message: String = "Offline session expired — reconnect to reauthorize") : LocalScanResult()
    data class StorageFailure(val error: String) : LocalScanResult()
}

class AttendanceRepository(private val context: Context) {
    private val db = AmasDatabase.getInstance(context)
    private val rosterDao = db.rosterDao()
    private val authDao = db.authorizationDao()
    private val outboxDao = db.outboxDao()

    val pendingCount: Flow<Int> = outboxDao.observePendingCount()
    val allEvents: Flow<List<OutboxEntity>> = outboxDao.observeAllEvents()

    suspend fun fetchAndStoreServerPackage(
        baseUrl: String,
        sessionId: String,
        authToken: String?,
        deviceFingerprint: String
    ): Result<Unit> = withContext(Dispatchers.IO) {
        try {
            val url = "$baseUrl/api/v1/sessions/$sessionId/offline-package?deviceFingerprint=$deviceFingerprint"
            val requestBuilder = okhttp3.Request.Builder().url(url)
            if (!authToken.isNullOrBlank()) {
                requestBuilder.addHeader("Authorization", "Bearer $authToken")
            }
            val client = okhttp3.OkHttpClient()
            val response = client.newCall(requestBuilder.build()).execute()
            if (!response.isSuccessful) {
                return@withContext Result.failure(Exception("Failed to fetch session package: HTTP ${response.code}"))
            }

            val body = response.body?.string() ?: return@withContext Result.failure(Exception("Empty response body"))
            val json = org.json.JSONObject(body)
            val header = json.getJSONObject("header")
            val payload = json.getJSONObject("payload")
            val signature = json.getString("signature")

            val peopleArray = payload.getJSONArray("peopleMappings")
            val peopleList = mutableListOf<CachedRosterEntity>()
            for (i in 0 until peopleArray.length()) {
                val p = peopleArray.getJSONObject(i)
                peopleList.add(
                    CachedRosterEntity(
                        personId = p.getString("personId"),
                        externalId = p.getString("externalId"),
                        fullName = p.getString("fullName"),
                        cardUid = p.optString("cardUid", "").replace(":", "").uppercase(Locale.ROOT),
                        rosterVersion = payload.getInt("rosterVersion")
                    )
                )
            }

            val authEntity = OfflineAuthorizationEntity(
                authorizationId = payload.getString("authorizationId"),
                sessionId = payload.getString("sessionId"),
                organizationId = payload.getString("organizationId"),
                issuedAtEpochSec = header.getLong("issuedAt"),
                expiresAtEpochSec = header.getLong("expiresAt"),
                rosterVersion = payload.getInt("rosterVersion"),
                rosterDigest = payload.getString("rosterDigest"),
                signature = signature
            )

            saveOfflinePackage(authEntity, peopleList)
            Result.success(Unit)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun saveOfflinePackage(
        auth: OfflineAuthorizationEntity,
        people: List<CachedRosterEntity>
    ) = withContext(Dispatchers.IO) {
        authDao.insertAuthorization(auth)
        rosterDao.clearAll()
        rosterDao.insertAll(people)
    }

    suspend fun getActiveAuthorization(sessionId: String): OfflineAuthorizationEntity? = withContext(Dispatchers.IO) {
        authDao.getAuthorizationForSession(sessionId)
    }

    /**
     * Non-negotiable invariant: Persist to Room before UI reports success!
     */
    suspend fun processCardTap(sessionId: String, rawCardUid: String): LocalScanResult = withContext(Dispatchers.IO) {
        val normalizedUid = rawCardUid.replace(":", "").uppercase(Locale.ROOT)

        // 1. Verify authorization lease window
        val auth = authDao.getAuthorizationForSession(sessionId)
        if (auth != null) {
            val nowSec = System.currentTimeMillis() / 1000
            if (nowSec > auth.expiresAtEpochSec) {
                return@withContext LocalScanResult.AuthorizationExpired()
            }
        }

        // 2. Lookup person in cached Room roster
        val person = rosterDao.findByCardUid(normalizedUid)
            ?: return@withContext LocalScanResult.CardNotRegistered(normalizedUid)

        // 3. Local duplicate check
        val existing = outboxDao.findLocalScanForPerson(sessionId, person.personId)
        if (existing != null) {
            return@withContext LocalScanResult.AlreadyRecorded(person.fullName, existing.deviceWallClockTime)
        }

        // 4. Create durable OutboxEntity
        val sdf = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
        sdf.timeZone = TimeZone.getTimeZone("UTC")
        val wallClockIso = sdf.format(Date())

        val event = OutboxEntity(
            eventId = UUID.randomUUID().toString(),
            sessionId = sessionId,
            authorizationId = auth?.authorizationId,
            cardUid = normalizedUid,
            personId = person.personId,
            personName = person.fullName,
            deviceWallClockTime = wallClockIso,
            monotonicElapsedMs = SystemClock.elapsedRealtime(),
            syncState = "PENDING_SYNC"
        )

        // 5. Transactionally commit to Room disk storage
        try {
            val rowId = outboxDao.insert(event)
            if (rowId == -1L) {
                return@withContext LocalScanResult.AlreadyRecorded(person.fullName, wallClockIso)
            }
        } catch (e: Exception) {
            return@withContext LocalScanResult.StorageFailure(e.message ?: "Failed to persist to local database")
        }

        // 6. Trigger WorkManager background sync
        scheduleSync()

        // 7. Only after durable commit, return provisional capture confirmation
        return@withContext LocalScanResult.CapturedOffline(person.fullName)
    }

    fun scheduleSync() {
        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()

        val syncRequest = OneTimeWorkRequestBuilder<SyncWorker>()
            .setConstraints(constraints)
            .build()

        WorkManager.getInstance(context).enqueueUniqueWork(
            "AMAS_OUTBOX_SYNC",
            ExistingWorkPolicy.KEEP,
            syncRequest
        )
    }
}
