package com.pirate.app.util

import com.pirate.app.BuildConfig

private const val DEFAULT_TEMPO_MUSIC_SOCIAL_SUBGRAPH_URL =
  "https://api.goldsky.com/api/public/project_cmjjtjqpvtip401u87vcp20wd/subgraphs/dotheaven-music-social-tempo/1.0.0/gn"

private const val DEFAULT_TEMPO_PROFILES_SUBGRAPH_URL =
  "https://graph.dotheaven.org/subgraphs/name/dotheaven/profiles-tempo"

fun tempoMusicSocialSubgraphUrls(): List<String> {
  val configured = runCatching { BuildConfig.TEMPO_MUSIC_SOCIAL_SUBGRAPH_URL }.getOrDefault("").trim().removeSuffix("/")
  return listOfNotNull(
    configured.takeIf { it.isNotBlank() },
    DEFAULT_TEMPO_MUSIC_SOCIAL_SUBGRAPH_URL,
  ).distinct()
}

fun tempoProfilesSubgraphUrls(): List<String> {
  val configured = runCatching { BuildConfig.TEMPO_PROFILES_SUBGRAPH_URL }.getOrDefault("").trim().removeSuffix("/")
  return listOfNotNull(
    configured.takeIf { it.isNotBlank() },
    DEFAULT_TEMPO_PROFILES_SUBGRAPH_URL,
  ).distinct()
}
