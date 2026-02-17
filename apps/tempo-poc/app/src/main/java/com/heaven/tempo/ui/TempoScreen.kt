package com.heaven.tempo.ui

import android.app.Activity
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.unit.dp
import com.heaven.tempo.*
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.*

private const val GAS_LIMIT_PASSKEY_TX = 400_000L
private const val GAS_LIMIT_KEY_AUTH_TX = 650_000L
private const val GAS_LIMIT_SESSION_KEY_TX = 300_000L

@Composable
fun TempoScreen(activity: Activity) {
    val scope = rememberCoroutineScope()
    val clipboard = LocalClipboardManager.current

    var account by remember { mutableStateOf<TempoPasskeyManager.PasskeyAccount?>(null) }
    var sessionKey by remember { mutableStateOf<SessionKeyManager.SessionKey?>(null) }
    var balance by remember { mutableStateOf<String?>(null) }
    var txHash by remember { mutableStateOf<String?>(null) }
    var chainId by remember { mutableStateOf<Long?>(null) }
    var log by remember { mutableStateOf("Ready. Tap 'Check Connection' to start.") }
    var loading by remember { mutableStateOf(false) }

    // Auto-load saved account + session key on startup
    LaunchedEffect(Unit) {
        val saved = TempoPasskeyManager.loadAccount(activity)
        if (saved != null) {
            account = saved
            log = "Loaded saved account: ${saved.address}"
        }
        val savedSession = SessionKeyManager.load(activity)
        if (SessionKeyManager.isValid(savedSession)) {
            sessionKey = savedSession
            log += "\nSession key loaded (expires ${formatTime(savedSession!!.expiresAt)})"
        }
        log += "\nTap 'Check Connection' to start."
    }

    fun appendLog(msg: String) {
        log = "$log\n\n$msg"
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp)
            .verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text(
            text = "Tempo POC",
            style = MaterialTheme.typography.headlineLarge,
        )

        Text(
            text = "Chain: Tempo Testnet (Moderato) · ID ${TempoClient.CHAIN_ID}",
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        HorizontalDivider()

        // Step 0: Check connection
        Button(
            onClick = {
                scope.launch {
                    loading = true
                    try {
                        val id = TempoClient.getChainId()
                        chainId = id
                        appendLog("Connected! Chain ID: $id")
                    } catch (e: Exception) {
                        appendLog("Connection failed: ${e.message}")
                    }
                    loading = false
                }
            },
            enabled = !loading,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text("Check Connection")
        }

        // Step 1: Create or Login
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Button(
                onClick = {
                    scope.launch {
                        loading = true
                        try {
                            val result = TempoPasskeyManager.createAccount(activity)
                            account = result
                            appendLog(
                                "Passkey created!\n" +
                                "Address: ${result.address}\n" +
                                "PubKey X: ${result.pubKey.xHex.take(16)}...\n" +
                                "PubKey Y: ${result.pubKey.yHex.take(16)}..."
                            )
                        } catch (e: Exception) {
                            appendLog("Passkey creation failed: ${e.message}")
                        }
                        loading = false
                    }
                },
                enabled = !loading && chainId != null,
                modifier = Modifier.weight(1f),
            ) {
                Text("1a. Create Passkey")
            }

            OutlinedButton(
                onClick = {
                    scope.launch {
                        loading = true
                        try {
                            val result = TempoPasskeyManager.login(activity)
                            account = result
                            appendLog("Logged in!\nAddress: ${result.address}")
                        } catch (e: Exception) {
                            appendLog("Login failed: ${e.message}")
                        }
                        loading = false
                    }
                },
                enabled = !loading && chainId != null,
                modifier = Modifier.weight(1f),
            ) {
                Text("1b. Login")
            }
        }

        // Show address if created
        account?.let { acc ->
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.primaryContainer
                ),
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text("Account Address", style = MaterialTheme.typography.labelLarge)
                    Spacer(Modifier.height(4.dp))
                    Text(acc.address, style = MaterialTheme.typography.bodyLarge)
                    Spacer(Modifier.height(8.dp))
                    TextButton(onClick = {
                        clipboard.setText(AnnotatedString(acc.address))
                    }) {
                        Text("Copy Address")
                    }
                }
            }
        }

        // Step 2: Fund
        Button(
            onClick = {
                scope.launch {
                    loading = true
                    try {
                        val addr = account?.address ?: return@launch
                        val result = TempoClient.fundAddress(addr)
                        appendLog("Fund result: $result")
                        val bal = TempoClient.getBalance(addr)
                        balance = bal
                        appendLog("AlphaUSD balance: $bal")
                    } catch (e: Exception) {
                        appendLog("Fund failed: ${e.message}")
                    }
                    loading = false
                }
            },
            enabled = !loading && account != null,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text("2. Fund Account")
        }

        balance?.let { bal ->
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.secondaryContainer
                ),
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text("AlphaUSD Balance", style = MaterialTheme.typography.labelLarge)
                    Spacer(Modifier.height(4.dp))
                    Text(bal, style = MaterialTheme.typography.headlineSmall)
                }
            }
        }

        // Step 3: Send tx with passkey (direct WebAuthn)
        Button(
            onClick = {
                scope.launch {
                    loading = true
                    try {
                        val acc = account ?: return@launch

                        appendLog("Building transaction...")
                        val nonce = TempoClient.getNonce(acc.address)
                        val fees = TempoClient.getSuggestedFees()
                        appendLog("Nonce: $nonce")
                        appendLog("Fees: maxPriority=${fees.maxPriorityFeePerGas}, maxFee=${fees.maxFeePerGas}")

                        val tx = TempoTransaction.UnsignedTx(
                            nonce = nonce,
                            maxPriorityFeePerGas = fees.maxPriorityFeePerGas,
                            maxFeePerGas = fees.maxFeePerGas,
                            gasLimit = GAS_LIMIT_PASSKEY_TX,
                            calls = listOf(
                                TempoTransaction.Call(
                                    to = P256Utils.hexToBytes(acc.address),
                                    value = 0,
                                )
                            ),
                        )

                        val sigHash = TempoTransaction.signatureHash(tx)
                        appendLog("Sig hash: 0x${P256Utils.bytesToHex(sigHash).take(16)}...")

                        appendLog("Requesting passkey signature...")
                        val assertion = TempoPasskeyManager.sign(activity, sigHash, acc)
                        appendLog("Signed! r=${P256Utils.bytesToHex(assertion.signatureR).take(16)}...")

                        val signedTxHex = TempoTransaction.encodeSignedWebAuthn(tx, assertion)
                        appendLog("Signed tx: ${signedTxHex.take(32)}... (${signedTxHex.length / 2} bytes)")

                        val hash = TempoClient.sendRawTransaction(signedTxHex)
                        txHash = hash
                        appendLog("TX sent! Hash: $hash")
                    } catch (e: Exception) {
                        appendLog("Send failed: ${e.message}")
                        e.printStackTrace()
                    }
                    loading = false
                }
            },
            enabled = !loading && account != null && balance != null,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text("3. Send Tx (Passkey — biometric)")
        }

        HorizontalDivider()

        // === SESSION KEY SECTION ===
        Text("Session Key (silent signing)", style = MaterialTheme.typography.titleMedium)

        // Session key status
        sessionKey?.let { sk ->
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(
                    containerColor = if (SessionKeyManager.isValid(sk))
                        MaterialTheme.colorScheme.tertiaryContainer
                    else
                        MaterialTheme.colorScheme.errorContainer
                ),
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(
                        if (SessionKeyManager.isValid(sk)) "Session Key Active" else "Session Key Expired",
                        style = MaterialTheme.typography.labelLarge,
                    )
                    Spacer(Modifier.height(4.dp))
                    Text("Address: ${sk.address}", style = MaterialTheme.typography.bodyMedium)
                    Text("Expires: ${formatTime(sk.expiresAt)}", style = MaterialTheme.typography.bodyMedium)
                }
            }
        }

        // Step 4: Authorize session key (requires passkey biometric once)
        Button(
            onClick = {
                scope.launch {
                    loading = true
                    try {
                        val acc = account ?: return@launch

                        appendLog("Generating session key...")
                        val sk = SessionKeyManager.generate()
                        appendLog("Session key: ${sk.address}\nExpires: ${formatTime(sk.expiresAt)}")

                        // Build the KeyAuthorization digest
                        val digest = SessionKeyManager.buildKeyAuthDigest(sk)
                        appendLog("KeyAuth digest: 0x${P256Utils.bytesToHex(digest).take(16)}...")

                        // Sign with passkey (this is the ONE biometric prompt)
                        appendLog("Requesting passkey signature for session key authorization...")
                        val assertion = TempoPasskeyManager.sign(activity, digest, acc)
                        appendLog("Passkey signed!")

                        // Build the SignedKeyAuthorization
                        val signedKeyAuth = SessionKeyManager.buildSignedKeyAuthorization(sk, assertion)
                        appendLog("SignedKeyAuthorization: ${signedKeyAuth.size} bytes")

                        // Send a tx with the key authorization to register it on-chain
                        val nonce = TempoClient.getNonce(acc.address)
                        val fees = TempoClient.getSuggestedFees()
                        appendLog("Fees: maxPriority=${fees.maxPriorityFeePerGas}, maxFee=${fees.maxFeePerGas}")
                        val tx = TempoTransaction.UnsignedTx(
                            nonce = nonce,
                            maxPriorityFeePerGas = fees.maxPriorityFeePerGas,
                            maxFeePerGas = fees.maxFeePerGas,
                            gasLimit = GAS_LIMIT_KEY_AUTH_TX,
                            calls = listOf(
                                TempoTransaction.Call(
                                    to = P256Utils.hexToBytes(acc.address),
                                    value = 0,
                                )
                            ),
                            keyAuthorization = signedKeyAuth,
                        )

                        // Sign the authorization tx with passkey too
                        val txSigHash = TempoTransaction.signatureHash(tx)
                        val txAssertion = TempoPasskeyManager.sign(activity, txSigHash, acc)
                        val signedTxHex = TempoTransaction.encodeSignedWebAuthn(tx, txAssertion)

                        val hash = TempoClient.sendRawTransaction(signedTxHex)
                        appendLog("Session key authorized! TX: $hash")

                        // Save session key
                        sessionKey = sk
                        SessionKeyManager.save(activity, sk)
                        txHash = hash
                    } catch (e: Exception) {
                        appendLog("Session key auth failed: ${e.message}")
                        e.printStackTrace()
                    }
                    loading = false
                }
            },
            enabled = !loading && account != null && balance != null,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text("4. Authorize Session Key (biometric once)")
        }

        // Step 5: Send tx with session key (SILENT — no biometric!)
        Button(
            onClick = {
                scope.launch {
                    loading = true
                    try {
                        val acc = account ?: return@launch
                        val sk = sessionKey ?: return@launch

                        if (!SessionKeyManager.isValid(sk)) {
                            appendLog("Session key expired! Re-authorize first.")
                            loading = false
                            return@launch
                        }

                        appendLog("Building silent transaction...")
                        val nonce = TempoClient.getNonce(acc.address)
                        val fees = TempoClient.getSuggestedFees()
                        appendLog("Fees: maxPriority=${fees.maxPriorityFeePerGas}, maxFee=${fees.maxFeePerGas}")

                        val tx = TempoTransaction.UnsignedTx(
                            nonce = nonce,
                            maxPriorityFeePerGas = fees.maxPriorityFeePerGas,
                            maxFeePerGas = fees.maxFeePerGas,
                            gasLimit = GAS_LIMIT_SESSION_KEY_TX,
                            calls = listOf(
                                TempoTransaction.Call(
                                    to = P256Utils.hexToBytes(acc.address),
                                    value = 0,
                                )
                            ),
                        )

                        val sigHash = TempoTransaction.signatureHash(tx)

                        // Sign with session key — NO biometric prompt!
                        val keychainSig = SessionKeyManager.signWithSessionKey(sk, acc.address, sigHash)
                        appendLog("Signed silently with session key!")

                        val signedTxHex = TempoTransaction.encodeSignedSessionKey(tx, keychainSig)
                        appendLog("Signed tx: ${signedTxHex.take(32)}... (${signedTxHex.length / 2} bytes)")

                        val hash = TempoClient.sendRawTransaction(signedTxHex)
                        txHash = hash
                        appendLog("SILENT TX sent! Hash: $hash\nNo biometric prompt needed!")
                    } catch (e: Exception) {
                        appendLog("Silent send failed: ${e.message}")
                        e.printStackTrace()
                    }
                    loading = false
                }
            },
            enabled = !loading && account != null && SessionKeyManager.isValid(sessionKey),
            modifier = Modifier.fillMaxWidth(),
            colors = ButtonDefaults.buttonColors(
                containerColor = MaterialTheme.colorScheme.tertiary,
            ),
        ) {
            Text("5. Send Tx (Session Key — NO biometric!)")
        }

        // Show tx hash
        txHash?.let { hash ->
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.tertiaryContainer
                ),
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text("Last Transaction", style = MaterialTheme.typography.labelLarge)
                    Spacer(Modifier.height(4.dp))
                    Text(hash, style = MaterialTheme.typography.bodyLarge)
                    Spacer(Modifier.height(4.dp))
                    Text(
                        "${TempoClient.EXPLORER_URL}/tx/$hash",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.primary,
                    )
                }
            }
        }

        HorizontalDivider()

        // Log output
        Text("Log", style = MaterialTheme.typography.titleMedium)

        if (loading) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                Text("Working...", style = MaterialTheme.typography.bodyLarge)
            }
        }

        Text(
            text = log,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        Spacer(Modifier.height(48.dp))
    }
}

private fun formatTime(epochSecs: Long): String {
    val sdf = SimpleDateFormat("MMM dd, HH:mm", Locale.US)
    return sdf.format(Date(epochSecs * 1000))
}
