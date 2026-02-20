package com.pirate.app.profile

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.pirate.app.theme.PiratePalette
import com.pirate.app.ui.VerifiedSealBadge
import com.pirate.app.util.resolveAvatarUrl

private val BannerGradient = Brush.verticalGradient(
  colors = listOf(Color(0xFF2D1B4E), Color(0xFF1A1040), Color(0xFF171717)),
)

@Composable
internal fun ProfileScreenHeaderSection(
  ethAddress: String?,
  handleText: String,
  profileName: String?,
  effectiveAvatarRef: String?,
  selfVerified: Boolean,
  isOwnProfile: Boolean,
  followerCount: Int,
  followingCount: Int,
  hasTargetAddress: Boolean,
  canFollow: Boolean,
  canMessage: Boolean,
  followBusy: Boolean,
  followStateLoaded: Boolean,
  pendingFollowTarget: Boolean?,
  effectiveFollowing: Boolean,
  followError: String?,
  onBack: (() -> Unit)?,
  onOpenSettings: () -> Unit,
  onEditProfile: (() -> Unit)?,
  onNavigateFollowList: ((FollowListMode, String) -> Unit)?,
  onToggleFollow: () -> Unit,
  onMessageClick: (() -> Unit)?,
) {
  Box(modifier = Modifier.fillMaxWidth().height(100.dp)) {
    Box(modifier = Modifier.fillMaxWidth().height(100.dp).background(BannerGradient))
    if (onBack != null) {
      IconButton(
        onClick = onBack,
        modifier = Modifier.align(Alignment.TopStart).statusBarsPadding().padding(start = 8.dp),
      ) {
        Icon(Icons.AutoMirrored.Rounded.ArrowBack, contentDescription = "Back", tint = Color.White, modifier = Modifier.size(24.dp))
      }
    }
    if (isOwnProfile) {
      IconButton(
        onClick = onOpenSettings,
        modifier = Modifier.align(Alignment.TopEnd).statusBarsPadding().padding(end = 8.dp),
      ) {
        Icon(Icons.Rounded.Settings, contentDescription = "Settings", tint = Color.White, modifier = Modifier.size(24.dp))
      }
    }
    if (!isOwnProfile) {
      Text(
        handleText,
        modifier = Modifier.align(Alignment.TopCenter).statusBarsPadding().padding(top = 12.dp),
        style = MaterialTheme.typography.titleMedium,
        fontWeight = FontWeight.SemiBold,
        color = Color.White,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
      )
    }
  }

  Row(
    modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp).padding(top = 12.dp),
    verticalAlignment = Alignment.CenterVertically,
  ) {
    val avatarUrl = resolveAvatarUrl(effectiveAvatarRef)
    if (avatarUrl != null) {
      AsyncImage(
        model = avatarUrl,
        contentDescription = "Avatar",
        modifier = Modifier.size(72.dp).clip(CircleShape),
        contentScale = ContentScale.Crop,
      )
    } else {
      Surface(
        modifier = Modifier.size(72.dp),
        shape = CircleShape,
        color = MaterialTheme.colorScheme.surfaceVariant,
      ) {
        Box(contentAlignment = Alignment.Center) {
          Text(
            (profileName?.take(1) ?: handleText.take(1)).uppercase(),
            style = MaterialTheme.typography.headlineMedium,
            fontWeight = FontWeight.Bold,
          )
        }
      }
    }
    Spacer(Modifier.width(16.dp))
    Row(
      modifier = Modifier.weight(1f),
      horizontalArrangement = Arrangement.SpaceEvenly,
      verticalAlignment = Alignment.CenterVertically,
    ) {
      FollowStat("$followerCount", "followers") { ethAddress?.let { onNavigateFollowList?.invoke(FollowListMode.Followers, it) } }
      FollowStat("$followingCount", "following") { ethAddress?.let { onNavigateFollowList?.invoke(FollowListMode.Following, it) } }
    }
  }

  Spacer(Modifier.height(10.dp))

  if (profileName != null) {
    Row(
      modifier = Modifier.padding(horizontal = 20.dp),
      verticalAlignment = Alignment.CenterVertically,
      horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
      Text(
        profileName,
        modifier = Modifier.weight(1f, fill = false),
        style = MaterialTheme.typography.titleLarge,
        fontWeight = FontWeight.Bold,
        color = MaterialTheme.colorScheme.onBackground,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
      )
      if (selfVerified) {
        VerifiedSealBadge(size = 18.dp)
      }
    }
    Text(
      handleText,
      modifier = Modifier.padding(horizontal = 20.dp),
      style = MaterialTheme.typography.bodyLarge,
      color = PiratePalette.TextMuted,
      maxLines = 1,
      overflow = TextOverflow.Ellipsis,
    )
  } else {
    Row(
      modifier = Modifier.padding(horizontal = 20.dp),
      verticalAlignment = Alignment.CenterVertically,
      horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
      Text(
        handleText,
        modifier = Modifier.weight(1f, fill = false),
        style = MaterialTheme.typography.titleLarge,
        fontWeight = FontWeight.Bold,
        color = MaterialTheme.colorScheme.onBackground,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
      )
      if (selfVerified) {
        VerifiedSealBadge(size = 18.dp)
      }
    }
  }

  if (isOwnProfile && onEditProfile != null) {
    Spacer(Modifier.height(10.dp))
    OutlinedButton(
      onClick = onEditProfile,
      modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp),
    ) {
      Text("Edit Profile")
    }
  }

  if (!isOwnProfile && hasTargetAddress) {
    Spacer(Modifier.height(10.dp))
    Row(
      modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp),
      horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
      Button(
        modifier = if (canMessage) Modifier.weight(1f) else Modifier.fillMaxWidth(),
        onClick = onToggleFollow,
        enabled = canFollow && !followBusy && followStateLoaded,
      ) {
        Text(
          when {
            !followStateLoaded -> "..."
            followBusy && pendingFollowTarget == true -> "Following..."
            followBusy && pendingFollowTarget == false -> "Unfollowing..."
            effectiveFollowing -> "Following"
            else -> "Follow"
          },
        )
      }
      if (canMessage) {
        OutlinedButton(
          modifier = Modifier.weight(1f),
          onClick = { onMessageClick?.invoke() },
          enabled = !followBusy,
        ) {
          Text("Message")
        }
      }
    }
  }

  Spacer(Modifier.height(12.dp))
  if (!followError.isNullOrBlank()) {
    Text(
      followError,
      modifier = Modifier.padding(horizontal = 20.dp).padding(bottom = 8.dp),
      color = MaterialTheme.colorScheme.error,
      style = MaterialTheme.typography.bodySmall,
    )
  }
}
