package com.pirate.app.music

import com.pirate.app.arweave.Ans104DataItem
import com.pirate.app.tempo.SessionKeyManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.util.LinkedHashMap

/**
 * Upload encrypted blobs to Load network directly via Turbo ANS-104 endpoint.
 */
object LoadUploadApi {

    data class UploadResult(
        val id: String,         // piece CID / Load ID
        val gatewayUrl: String,
    )

    /**
     * Upload [blob] to Load network. Returns the piece CID.
     *
     * @param blob      encrypted file bytes
     * @param filename  hint for the stored filename
     * @param tags      optional key-value tags for the upload
     * @param sessionKey active Tempo session key used to sign ANS-104 DataItem
     */
    suspend fun upload(
        blob: ByteArray,
        filename: String,
        tags: List<Pair<String, String>> = emptyList(),
        sessionKey: SessionKeyManager.SessionKey,
    ): UploadResult = withContext(Dispatchers.IO) {
        if (blob.isEmpty()) {
            throw IllegalStateException("Load upload payload is empty.")
        }

        val normalizedTags = LinkedHashMap<String, String>()
        for ((rawName, rawValue) in tags) {
            val name = rawName.trim()
            val value = rawValue.trim()
            if (name.isEmpty() || value.isEmpty()) continue
            normalizedTags[name] = value
        }
        if (normalizedTags.keys.none { it.equals("Content-Type", ignoreCase = true) }) {
            normalizedTags["Content-Type"] = "application/octet-stream"
        }
        if (normalizedTags.keys.none { it.equals("App-Name", ignoreCase = true) }) {
            normalizedTags["App-Name"] = "Heaven"
        }
        if (normalizedTags.keys.none { it.equals("Upload-Source", ignoreCase = true) }) {
            normalizedTags["Upload-Source"] = "heaven-android"
        }
        if (normalizedTags.keys.none { it.equals("File-Name", ignoreCase = true) }) {
            normalizedTags["File-Name"] = filename
        }

        val signed = Ans104DataItem.buildAndSign(
            payload = blob,
            tags = normalizedTags.map { (name, value) ->
                Ans104DataItem.Tag(name = name, value = value)
            },
            sessionKey = sessionKey,
        )
        val id = Ans104DataItem.uploadSignedDataItem(signed.bytes).trim()
        if (id.isEmpty()) {
            throw IllegalStateException("Load upload succeeded but returned no id")
        }
        UploadResult(
            id = id,
            gatewayUrl = "${LoadTurboConfig.DEFAULT_GATEWAY_URL}/resolve/$id",
        )
    }
}
