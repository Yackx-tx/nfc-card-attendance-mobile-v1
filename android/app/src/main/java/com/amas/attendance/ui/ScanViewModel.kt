package com.amas.attendance.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.amas.attendance.data.local.CachedRosterEntity
import com.amas.attendance.data.local.OfflineAuthorizationEntity
import com.amas.attendance.data.repository.AttendanceRepository
import com.amas.attendance.data.repository.LocalScanResult
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

data class ScanUiState(
    val sessionId: String = "session-demo-101",
    val sessionTitle: String = "Morning Lecture (Offline Mode)",
    val lastScanResult: LocalScanResult? = null,
    val isScanning: Boolean = false,
    val isOfflineMode: Boolean = true
)

class ScanViewModel(application: Application) : AndroidViewModel(application) {
    private val repository = AttendanceRepository(application)

    private val _uiState = MutableStateFlow(ScanUiState())
    val uiState: StateFlow<ScanUiState> = _uiState.asStateFlow()

    val pendingCount: StateFlow<Int> = repository.pendingCount
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), 0)

    val allEvents = repository.allEvents
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    fun onCardScanned(cardUid: String) {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isScanning = true)
            val result = repository.processCardTap(_uiState.value.sessionId, cardUid)
            _uiState.value = _uiState.value.copy(
                lastScanResult = result,
                isScanning = false
            )
        }
    }

    fun triggerSync() {
        repository.scheduleSync()
    }

    fun loadServerSession(baseUrl: String, sessionId: String, token: String? = null) {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(
                sessionId = sessionId,
                sessionTitle = "Session: $sessionId (Fetching...)"
            )
            val result = repository.fetchAndStoreServerPackage(
                baseUrl = baseUrl,
                sessionId = sessionId,
                authToken = token,
                deviceFingerprint = "android-device-" + android.os.Build.SERIAL
            )
            if (result.isSuccess) {
                _uiState.value = _uiState.value.copy(
                    sessionTitle = "Session Active (Server Authorized)"
                )
            } else {
                _uiState.value = _uiState.value.copy(
                    sessionTitle = "Session Load Failed: ${result.exceptionOrNull()?.message}"
                )
            }
        }
    }

    fun seedDemoRosterIfEmpty() {
        viewModelScope.launch {
            val existing = repository.getActiveAuthorization(_uiState.value.sessionId)
            if (existing == null) {
                val nowSec = System.currentTimeMillis() / 1000
                val auth = OfflineAuthorizationEntity(
                    authorizationId = "auth-demo-uuid",
                    sessionId = _uiState.value.sessionId,
                    organizationId = "org-demo",
                    issuedAtEpochSec = nowSec,
                    expiresAtEpochSec = nowSec + 8 * 3600, // 8 hours lease
                    rosterVersion = 1,
                    rosterDigest = "digest-hex",
                    signature = "demo-ed25519-signature"
                )
                val demoPeople = listOf(
                    CachedRosterEntity("p1", "00101", "Alice Wonder", "04A1B2C3", 1),
                    CachedRosterEntity("p2", "00102", "Bob Builder", "04A1B2C4", 1),
                    CachedRosterEntity("p3", "00103", "Charlie Brown", "04A1B2C5", 1)
                )
                repository.saveOfflinePackage(auth, demoPeople)
            }
        }
    }
}
