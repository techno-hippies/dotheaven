package com.pirate.app.song

import com.pirate.app.util.HttpClients
import okhttp3.MediaType.Companion.toMediaType

internal val songArtistClient = HttpClients.Api
internal val songArtistJsonMediaType = "application/json; charset=utf-8".toMediaType()
