package com.pirate.app.wallet

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.ContentCopy
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.pirate.app.tempo.TempoClient
import com.pirate.app.ui.PirateMobileHeader
import java.math.BigDecimal
import java.math.BigInteger
import java.math.RoundingMode
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

private fun formatUsd(rawAmount: BigInteger, decimals: Int): String {
  if (rawAmount <= BigInteger.ZERO) return "0.00"
  val safeDecimals = decimals.coerceAtLeast(0)
  val divisor = BigDecimal.TEN.pow(safeDecimals)
  val value = rawAmount.toBigDecimal().divide(divisor, 2, RoundingMode.DOWN)
  return value.setScale(2, RoundingMode.DOWN).toPlainString()
}

private data class WalletAssetBalance(
  val id: String,
  val symbol: String,
  val network: String,
  val rawAmount: BigInteger,
  val decimals: Int,
)

@Composable
fun WalletScreen(
  isAuthenticated: Boolean,
  walletAddress: String?,
  onClose: () -> Unit,
  onShowMessage: (String) -> Unit,
) {
  val clipboard = LocalClipboardManager.current

  var balances by remember(walletAddress) { mutableStateOf<List<WalletAssetBalance>>(emptyList()) }
  var loadingBalances by remember(walletAddress) { mutableStateOf(false) }
  var loadError by remember(walletAddress) { mutableStateOf<String?>(null) }
  var refreshNonce by remember { mutableIntStateOf(0) }
  val totalBalance = balances
    .fold(BigDecimal.ZERO) { acc, next ->
      val divisor = BigDecimal.TEN.pow(next.decimals.coerceAtLeast(0))
      acc + next.rawAmount.toBigDecimal().divide(divisor, next.decimals.coerceAtLeast(0), RoundingMode.DOWN)
    }
    .setScale(2, RoundingMode.DOWN)
    .toPlainString()

  LaunchedEffect(isAuthenticated, walletAddress, refreshNonce) {
    val address = walletAddress?.trim()
    if (!isAuthenticated || address.isNullOrBlank()) {
      balances = emptyList()
      loadError = null
      loadingBalances = false
      return@LaunchedEffect
    }

    loadingBalances = true
    loadError = null
    runCatching {
      withContext(Dispatchers.IO) {
        val tempoRows =
          TempoClient
            .getStablecoinBalances(address)
            .map { stable ->
              WalletAssetBalance(
                id = "tempo:${stable.token.address.lowercase()}",
                symbol = stable.token.symbol,
                network = "Tempo",
                rawAmount = stable.rawAmount,
                decimals = stable.token.decimals,
              )
            }

        val baseSepoliaUsdc = TempoClient.getErc20BalanceRaw(
          address = address,
          token = TempoClient.BASE_SEPOLIA_USDC,
          rpcUrl = TempoClient.BASE_SEPOLIA_RPC_URL,
        )
        val baseRow =
          WalletAssetBalance(
            id = "base:${TempoClient.BASE_SEPOLIA_USDC.lowercase()}",
            symbol = "USDC",
            network = "Base Sepolia",
            rawAmount = baseSepoliaUsdc,
            decimals = 6,
          )

        tempoRows + baseRow
      }
    }.onSuccess {
      balances = it
    }.onFailure { err ->
      loadError = err.message ?: "Failed to load wallet balances."
      onShowMessage("Couldn't refresh wallet balances.")
    }
    loadingBalances = false
  }

  Column(
    modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background),
  ) {
    PirateMobileHeader(
      title = "Wallet (\$$totalBalance)",
      onClosePress = onClose,
      rightSlot = {
        IconButton(
          onClick = { refreshNonce += 1 },
          enabled = isAuthenticated && !walletAddress.isNullOrBlank() && !loadingBalances,
        ) {
          Icon(Icons.Rounded.Refresh, contentDescription = "Refresh wallet")
        }
      },
    )

    if (!isAuthenticated || walletAddress.isNullOrBlank()) {
      Box(
        modifier = Modifier.fillMaxSize().padding(28.dp),
        contentAlignment = Alignment.Center,
      ) {
        Text(
          "Sign in to view your wallet",
          style = MaterialTheme.typography.bodyLarge,
          color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
      }
      return@Column
    }

    val address = walletAddress.trim()

    LazyColumn(
      modifier = Modifier.fillMaxSize(),
      contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 20.dp),
      verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
      item {
        OutlinedTextField(
          value = address,
          onValueChange = {},
          modifier = Modifier.fillMaxWidth().padding(top = 6.dp),
          readOnly = true,
          singleLine = true,
          label = { Text("Address") },
          trailingIcon = {
            IconButton(
              onClick = {
                clipboard.setText(AnnotatedString(address))
                onShowMessage("Wallet address copied.")
              },
            ) {
              Icon(Icons.Rounded.ContentCopy, contentDescription = "Copy address")
            }
          },
        )
      }

      if (loadingBalances && balances.isEmpty()) {
        item {
          Box(
            modifier = Modifier.fillMaxWidth().padding(vertical = 20.dp),
            contentAlignment = Alignment.Center,
          ) {
            CircularProgressIndicator(modifier = Modifier.size(28.dp))
          }
        }
      }

      if (!loadError.isNullOrBlank()) {
        item {
          Text(
            loadError!!,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.error,
          )
        }
      }

      items(
        items = balances,
        key = { it.id },
      ) { balance ->
        Surface(modifier = Modifier.fillMaxWidth(), color = MaterialTheme.colorScheme.background) {
          Column(
            modifier = Modifier.fillMaxWidth(),
          ) {
            Row(
              modifier = Modifier.fillMaxWidth().padding(vertical = 10.dp),
              verticalAlignment = Alignment.CenterVertically,
            ) {
              Column(modifier = Modifier.weight(1f)) {
                Text(
                  balance.symbol,
                  style = MaterialTheme.typography.titleMedium,
                  fontWeight = FontWeight.SemiBold,
                )
                Text(
                  balance.network,
                  style = MaterialTheme.typography.bodyMedium,
                  color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
              }
              Text(
                "\$${formatUsd(balance.rawAmount, decimals = balance.decimals)}",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
              )
            }
            HorizontalDivider()
          }
        }
      }
    }
  }
}
