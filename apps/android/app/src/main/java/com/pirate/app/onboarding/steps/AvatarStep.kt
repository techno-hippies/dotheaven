package com.pirate.app.onboarding.steps

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.util.Base64
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.AddAPhoto
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.io.ByteArrayOutputStream

private const val MAX_AVATAR_SIZE = 512
private const val JPEG_QUALITY = 85
private const val MAX_FILE_SIZE = 2 * 1024 * 1024 // 2 MB

@Composable
fun AvatarStep(
  submitting: Boolean,
  error: String?,
  onContinue: (base64: String, contentType: String) -> Unit,
  onSkip: (() -> Unit)? = null,
) {
  val context = LocalContext.current
  var preview by remember { mutableStateOf<Bitmap?>(null) }
  var imageBase64 by remember { mutableStateOf<String?>(null) }
  var localError by remember { mutableStateOf<String?>(null) }

  val launcher = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri: Uri? ->
    uri ?: return@rememberLauncherForActivityResult
    localError = null
    try {
      val inputStream = context.contentResolver.openInputStream(uri)
        ?: throw IllegalStateException("Cannot open image")
      val bytes = inputStream.readBytes()
      inputStream.close()

      if (bytes.size > MAX_FILE_SIZE) {
        val sizeMB = String.format("%.1f", bytes.size / (1024.0 * 1024.0))
        localError = "Image is too large (${sizeMB} MB). Please use an image under 2 MB."
        return@rememberLauncherForActivityResult
      }

      // Decode and resize
      val original = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
        ?: throw IllegalStateException("Cannot decode image")

      val (w, h) = original.width to original.height
      val scale = if (w > MAX_AVATAR_SIZE || h > MAX_AVATAR_SIZE) {
        MAX_AVATAR_SIZE.toFloat() / maxOf(w, h)
      } else 1f

      val targetW = (w * scale).toInt()
      val targetH = (h * scale).toInt()
      val scaled = if (scale < 1f) Bitmap.createScaledBitmap(original, targetW, targetH, true) else original

      // Compress to JPEG
      val out = ByteArrayOutputStream()
      scaled.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, out)
      val jpegBytes = out.toByteArray()

      preview = scaled
      imageBase64 = Base64.encodeToString(jpegBytes, Base64.NO_WRAP)
    } catch (e: Exception) {
      localError = e.message ?: "Failed to process image"
    }
  }

  val displayError = error ?: localError
  val canContinue = imageBase64 != null && !submitting

  Column(
    modifier = Modifier.fillMaxSize().padding(horizontal = 24.dp),
    horizontalAlignment = Alignment.CenterHorizontally,
  ) {
    Text("Add a profile photo", fontSize = 24.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onBackground)
    Spacer(Modifier.height(8.dp))
    Text("Anime or illustrated avatars preferred", fontSize = 16.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
    Spacer(Modifier.height(32.dp))

    // Avatar preview / picker
    Box(
      modifier = Modifier
        .size(140.dp)
        .clip(CircleShape)
        .background(MaterialTheme.colorScheme.surfaceVariant)
        .border(2.dp, MaterialTheme.colorScheme.outline, CircleShape)
        .clickable { launcher.launch("image/*") },
      contentAlignment = Alignment.Center,
    ) {
      if (preview != null) {
        androidx.compose.foundation.Image(
          bitmap = preview!!.asImageBitmap(),
          contentDescription = "Avatar preview",
          modifier = Modifier.size(140.dp).clip(CircleShape),
          contentScale = ContentScale.Crop,
        )
      } else {
        Icon(
          Icons.Rounded.AddAPhoto,
          contentDescription = "Pick photo",
          modifier = Modifier.size(40.dp),
          tint = MaterialTheme.colorScheme.onSurfaceVariant,
        )
      }
    }

    if (preview != null) {
      Spacer(Modifier.height(8.dp))
      TextButton(onClick = {
        preview = null
        imageBase64 = null
        localError = null
      }) {
        Text("Remove", fontSize = 14.sp)
      }
    }

    if (displayError != null) {
      Spacer(Modifier.height(8.dp))
      Text(displayError, fontSize = 14.sp, color = MaterialTheme.colorScheme.error)
    }

    Spacer(Modifier.weight(1f))

    Button(
      onClick = { imageBase64?.let { onContinue(it, "image/jpeg") } },
      enabled = canContinue,
      modifier = Modifier.fillMaxWidth().height(48.dp),
      shape = RoundedCornerShape(50),
    ) {
      if (submitting) {
        CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp, color = MaterialTheme.colorScheme.onPrimary)
      } else {
        Text("Continue", fontSize = 16.sp)
      }
    }

    Spacer(Modifier.height(32.dp))
  }
}
