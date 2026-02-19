package com.pirate.app.util

import com.pirate.app.music.CoverRef

fun resolveAvatarUrl(avatarUri: String?): String? {
  return CoverRef.resolveCoverUrl(
    ref = avatarUri,
    width = null,
    height = null,
    format = null,
    quality = null,
  )
}
