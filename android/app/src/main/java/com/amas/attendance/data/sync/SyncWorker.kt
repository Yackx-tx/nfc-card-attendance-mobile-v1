package com.amas.attendance.data.sync

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.amas.attendance.data.local.AmasDatabase
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class SyncWorker(
    appContext: Context,
    workerParams: WorkerParameters
) : CoroutineWorker(appContext, workerParams) {

    private val db = AmasDatabase.getInstance(appContext)
    private val outboxDao = db.outboxDao()
    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build()

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        val pendingEvents = outboxDao.getPendingSyncEvents(limit = 50)
        if (pendingEvents.isEmpty()) {
            return@withContext Result.success()
        }

        // Group by sessionId
        val bySession = pendingEvents.groupBy { it.sessionId }

        for ((sessionId, events) in bySession) {
            try {
                val jsonEvents = JSONArray()
                for (e in events) {
                    val obj = JSONObject().apply {
                        put("eventId", e.eventId)
                        e.authorizationId?.let { put("authorizationId", it) }
                        put("cardUid", e.cardUid)
                        put("deviceEventTime", e.deviceWallClockTime)
                        put("monotonicElapsedMs", e.monotonicElapsedMs)
                    }
                    jsonEvents.put(obj)
                }

                val payload = JSONObject().apply {
                    put("events", jsonEvents)
                }

                // Read server URL from prefs or default local test IP (10.0.2.2 for emulator or localhost)
                val serverUrl = "http://10.0.2.2:4000/api/v1/sessions/$sessionId/sync"

                val requestBody = payload.toString().toRequestBody("application/json".toMediaType())
                val request = Request.Builder()
                    .url(serverUrl)
                    .post(requestBody)
                    .build()

                val response = client.newCall(request).execute()
                if (response.isSuccessful) {
                    val responseBody = response.body?.string() ?: ""
                    val resJson = JSONObject(responseBody)
                    val outcomes = resJson.getJSONArray("outcomes")

                    for (i in 0 until outcomes.length()) {
                        val outcomeObj = outcomes.getJSONObject(i)
                        val eventId = outcomeObj.getString("eventId")
                        val outcome = outcomeObj.getString("outcome")
                        val reason = outcomeObj.optString("reason", null)

                        // Durably update Room outbox with server outcome
                        val syncState = when (outcome) {
                            "ACCEPTED" -> "SYNCED_ACCEPTED"
                            "DUPLICATE" -> "SYNCED_DUPLICATE"
                            "NEEDS_REVIEW" -> "NEEDS_REVIEW"
                            else -> "SYNCED_REJECTED"
                        }
                        outboxDao.updateEventOutcome(eventId, syncState, reason)
                    }
                } else {
                    for (e in events) {
                        outboxDao.incrementAttemptCount(e.eventId, "HTTP ${response.code}")
                    }
                    if (runAttemptCount < 5) {
                        return@withContext Result.retry()
                    }
                }
            } catch (e: Exception) {
                e.printStackTrace()
                for (event in events) {
                    outboxDao.incrementAttemptCount(event.eventId, e.message)
                }
                return@withContext Result.retry()
            }
        }

        return@withContext Result.success()
    }
}
