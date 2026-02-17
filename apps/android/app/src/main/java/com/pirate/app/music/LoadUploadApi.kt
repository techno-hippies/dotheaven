package com.pirate.app.music

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * Upload encrypted blobs to Load network via heaven-api proxy.
 */
object LoadUploadApi {

    private const val DEFAULT_API_URL = "https://api.dotheaven.com"

    private val client = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(120, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .build()

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
     * @param apiUrl    heaven-api base URL (defaults to prod)
     */
    suspend fun upload(
        blob: ByteArray,
        filename: String,
        tags: List<Pair<String, String>> = emptyList(),
        apiUrl: String = DEFAULT_API_URL,
    ): UploadResult = withContext(Dispatchers.IO) {
        val tagsJson = JSONArray().apply {
            for ((k, v) in tags) put(JSONObject().put("key", k).put("value", v))
        }.toString()

        val body = MultipartBody.Builder()
            .setType(MultipartBody.FORM)
            .addFormDataPart(
                "file", filename,
                blob.toRequestBody("application/octet-stream".toMediaType()),
            )
            .addFormDataPart("contentType", "application/octet-stream")
            .addFormDataPart("tags", tagsJson)
            .build()

        val request = Request.Builder()
            .url("$apiUrl/api/load/upload")
            .post(body)
            .build()

        val response = client.newCall(request).execute()
        val text = response.body?.string().orEmpty()
        val json = runCatching { JSONObject(text) }.getOrElse { JSONObject() }

        if (!response.isSuccessful) {
            throw RuntimeException(json.optString("error", "Load upload failed (${response.code})"))
        }

        val id = json.optString("id", "").ifBlank {
            throw RuntimeException("Load upload succeeded but returned no id")
        }

        val gatewayUrl = json.optString("gatewayUrl", "").ifBlank {
            "${LoadTurboConfig.DEFAULT_GATEWAY_URL}/$id"
        }

        UploadResult(id = id, gatewayUrl = gatewayUrl)
    }
}
