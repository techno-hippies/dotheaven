package com.pirate.app.music

data class TrackMenuPolicy(
  val canUpload: Boolean,
  val canSaveForever: Boolean,
  val canDownload: Boolean,
  val canShare: Boolean,
)

object TrackMenuPolicyResolver {
  fun resolve(
    track: MusicTrack,
    ownerEthAddress: String?,
    alreadyDownloaded: Boolean = false,
  ): TrackMenuPolicy {
    val owner = ownerEthAddress?.trim()?.lowercase().orEmpty()
    val hasOwner = owner.isNotBlank()
    val hasPieceCid = !track.pieceCid.isNullOrBlank()
    val isRemoteStream = isRemoteHttpUri(track.uri)
    val isLocalDeviceTrack = isMediaStoreAudioUri(track.uri)

    val datasetOwner = track.datasetOwner?.trim()?.lowercase().orEmpty()
    val ownsUploadedTrack = hasOwner && (datasetOwner.isBlank() || datasetOwner == owner)

    val canUpload = hasOwner && !hasPieceCid && !isRemoteStream
    val canSaveForever = hasOwner && track.permanentRef.isNullOrBlank() && (
      (hasPieceCid && ownsUploadedTrack) ||
        (!hasPieceCid && !isRemoteStream)
      )
    val canDownload = hasPieceCid && !isLocalDeviceTrack && !alreadyDownloaded
    val canShare = hasPieceCid && ownsUploadedTrack

    return TrackMenuPolicy(
      canUpload = canUpload,
      canSaveForever = canSaveForever,
      canDownload = canDownload,
      canShare = canShare,
    )
  }

  private fun isRemoteHttpUri(rawUri: String): Boolean {
    val uri = rawUri.trim()
    return uri.startsWith("http://") || uri.startsWith("https://")
  }

  private fun isMediaStoreAudioUri(rawUri: String): Boolean {
    val uri = rawUri.trim().lowercase()
    if (!uri.startsWith("content://media/")) return false
    return uri.contains("/audio/media/")
  }
}
