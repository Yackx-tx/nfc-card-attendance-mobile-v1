package com.amas.attendance

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import com.amas.attendance.nfc.MockNfcReceiver
import com.amas.attendance.nfc.NfcManager
import com.amas.attendance.ui.ScanScreen
import com.amas.attendance.ui.ScanViewModel

class MainActivity : ComponentActivity() {

    private val viewModel: ScanViewModel by viewModels()
    private lateinit var nfcManager: NfcManager

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Seed demo roster for immediate testing
        viewModel.seedDemoRosterIfEmpty()

        // Setup NFC hardware manager
        nfcManager = NfcManager(this) { cardUid ->
            viewModel.onCardScanned(cardUid)
        }

        // Setup mock NFC receiver listener (allows adb broadcast tests)
        MockNfcReceiver.onMockCardScanListener = { cardUid ->
            viewModel.onCardScanned(cardUid)
        }

        setContent {
            ScanScreen(
                viewModel = viewModel,
                onManualSimulateTap = { cardUid ->
                    viewModel.onCardScanned(cardUid)
                }
            )
        }
    }

    override fun onResume() {
        super.onResume()
        nfcManager.enableForegroundDispatch()
    }

    override fun onPause() {
        super.onPause()
        nfcManager.disableForegroundDispatch()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        nfcManager.handleIntent(intent)
    }

    override fun onDestroy() {
        super.onDestroy()
        MockNfcReceiver.onMockCardScanListener = null
    }
}
