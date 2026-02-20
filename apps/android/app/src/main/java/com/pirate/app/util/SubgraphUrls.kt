package com.pirate.app.util

import com.pirate.app.BuildConfig

private const val DEFAULT_SUBGRAPH_MUSIC_SOCIAL_URL =
  "https://graph.dotheaven.org/subgraphs/name/dotheaven/music-social-tempo"

private const val DEFAULT_SUBGRAPH_PROFILES_URL =
  "https://graph.dotheaven.org/subgraphs/name/dotheaven/profiles-tempo"

fun tempoMusicSocialSubgraphUrls(): List<String> {
  val configured = runCatching { BuildConfig.SUBGRAPH_MUSIC_SOCIAL_URL }.getOrDefault("").trim().removeSuffix("/")
  return listOfNotNull(
    configured.takeIf { it.isNotBlank() },
    DEFAULT_SUBGRAPH_MUSIC_SOCIAL_URL,
  ).distinct()
}

fun tempoProfilesSubgraphUrls(): List<String> {
  val configured = runCatching { BuildConfig.SUBGRAPH_PROFILES_URL }.getOrDefault("").trim().removeSuffix("/")
  return listOfNotNull(
    configured.takeIf { it.isNotBlank() },
    DEFAULT_SUBGRAPH_PROFILES_URL,
  ).distinct()
}
