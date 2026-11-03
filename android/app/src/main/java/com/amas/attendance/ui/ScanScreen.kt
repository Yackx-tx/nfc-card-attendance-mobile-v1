package com.amas.attendance.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.amas.attendance.data.repository.LocalScanResult

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ScanScreen(
    viewModel: ScanViewModel,
    onManualSimulateTap: (String) -> Unit
) {
    val uiState by viewModel.uiState.collectAsState()
    val pendingCount by viewModel.pendingCount.collectAsState()
    val events by viewModel.allEvents.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(
                            text = "AMAS Mobile Scanner",
                            fontSize = 18.sp,
                            fontWeight = FontWeight.Bold
                        )
                        Text(
                            text = uiState.sessionTitle,
                            fontSize = 12.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                },
                actions = {
                    // Pending sync badge
                    Surface(
                        shape = RoundedCornerShape(12.dp),
                        color = if (pendingCount > 0) Color(0xFFF59E0B) else Color(0xFF10B981),
                        modifier = Modifier.padding(end = 12.dp)
                    ) {
                        Text(
                            text = "Pending: $pendingCount",
                            color = Color.White,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp)
                        )
                    }
                }
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            // Scanner Status Feedback Card (Non-color reliant per UI spec)
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(bottom = 16.dp),
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(
                    containerColor = when (uiState.lastScanResult) {
                        is LocalScanResult.CapturedOffline -> Color(0xFFFEF3C7) // Amber - provisional
                        is LocalScanResult.AlreadyRecorded -> Color(0xFFE2E8F0) // Slate
                        is LocalScanResult.CardNotRegistered,
                        is LocalScanResult.AuthorizationExpired,
                        is LocalScanResult.StorageFailure -> Color(0xFFFEE2E2) // Red tint
                        null -> Color(0xFFF1F5F9)
                    }
                )
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(20.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    when (val res = uiState.lastScanResult) {
                        is LocalScanResult.CapturedOffline -> {
                            Text(
                                text = res.personName,
                                fontSize = 20.sp,
                                fontWeight = FontWeight.Bold,
                                color = Color(0xFF78350F)
                            )
                            Spacer(modifier = Modifier.height(6.dp))
                            Text(
                                text = res.message, // "Captured offline — pending verification"
                                fontSize = 14.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = Color(0xFFB45309)
                            )
                        }
                        is LocalScanResult.AlreadyRecorded -> {
                            Text(
                                text = res.personName,
                                fontSize = 18.sp,
                                fontWeight = FontWeight.Bold,
                                color = Color(0xFF334155)
                            )
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                text = "Already recorded at ${res.recordedTime.takeLast(13).take(8)}",
                                fontSize = 14.sp,
                                color = Color(0xFF64748B)
                            )
                        }
                        is LocalScanResult.CardNotRegistered -> {
                            Text(
                                text = "Card Not Registered",
                                fontSize = 18.sp,
                                fontWeight = FontWeight.Bold,
                                color = Color(0xFF991B1B)
                            )
                            Text(
                                text = "UID: ${res.cardUid}",
                                fontSize = 13.sp,
                                fontFamily = FontFamily.Monospace,
                                color = Color(0xFFDC2626)
                            )
                        }
                        is LocalScanResult.AuthorizationExpired -> {
                            Text(
                                text = res.message,
                                fontSize = 16.sp,
                                fontWeight = FontWeight.Bold,
                                color = Color(0xFF991B1B)
                            )
                        }
                        is LocalScanResult.StorageFailure -> {
                            Text(
                                text = "Storage Failure",
                                fontSize = 16.sp,
                                fontWeight = FontWeight.Bold,
                                color = Color(0xFF991B1B)
                            )
                            Text(text = res.error, fontSize = 12.sp, color = Color(0xFFDC2626))
                        }
                        null -> {
                            Text(
                                text = "Ready to Scan",
                                fontSize = 18.sp,
                                fontWeight = FontWeight.Bold,
                                color = Color(0xFF334155)
                            )
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                text = "Hold NFC card against the back of the device",
                                fontSize = 13.sp,
                                color = Color(0xFF64748B)
                            )
                        }
                    }
                }
            }

            // Quick Simulation buttons for Developer / Field testing
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(bottom = 12.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                OutlinedButton(
                    onClick = { onManualSimulateTap("04A1B2C3") },
                    modifier = Modifier.weight(1f)
                ) {
                    Text(text = "Tap Alice", fontSize = 11.sp)
                }
                OutlinedButton(
                    onClick = { onManualSimulateTap("04A1B2C4") },
                    modifier = Modifier.weight(1f)
                ) {
                    Text(text = "Tap Bob", fontSize = 11.sp)
                }
                Button(
                    onClick = { viewModel.triggerSync() },
                    modifier = Modifier.weight(1f),
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0284C7))
                ) {
                    Text(text = "Sync Now", fontSize = 11.sp)
                }
            }

            // Scanned Events Outbox List
            Text(
                text = "Local Outbox History (${events.size})",
                fontSize = 14.sp,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onSurface,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 8.dp)
            )

            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                items(events) { e ->
                    Surface(
                        shape = RoundedCornerShape(8.dp),
                        color = Color.White,
                        shadowElevation = 1.dp,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(12.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column {
                                Text(
                                    text = e.personName,
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 14.sp
                                )
                                Text(
                                    text = "UID: ${e.cardUid} • ${e.deviceWallClockTime.takeLast(13).take(8)}",
                                    fontSize = 11.sp,
                                    fontFamily = FontFamily.Monospace,
                                    color = Color.Gray
                                )
                            }
                            Surface(
                                shape = RoundedCornerShape(6.dp),
                                color = when (e.syncState) {
                                    "SYNCED_ACCEPTED" -> Color(0xFFDCFCE7)
                                    "PENDING_SYNC" -> Color(0xFFFEF3C7)
                                    "SYNCED_DUPLICATE" -> Color(0xFFF1F5F9)
                                    else -> Color(0xFFFEE2E2)
                                }
                            ) {
                                Text(
                                    text = e.syncState,
                                    fontSize = 10.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = when (e.syncState) {
                                        "SYNCED_ACCEPTED" -> Color(0xFF166534)
                                        "PENDING_SYNC" -> Color(0xFF92400E)
                                        else -> Color(0xFF334155)
                                    },
                                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp)
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}
