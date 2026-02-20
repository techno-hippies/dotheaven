plugins {
  id("com.android.application")
  id("org.jetbrains.kotlin.android")
  id("org.jetbrains.kotlin.plugin.compose")
}

android {
  namespace = "com.pirate.app"
  compileSdk = 36

  defaultConfig {
    applicationId = "com.pirate.app"
    minSdk = 24
    targetSdk = 36
    versionCode = 1
    versionName = "0.1.0"

    fun projectStringProperty(name: String): String? =
      (project.findProperty(name) as String?)
        ?.replace("\"", "\\\"")
        ?.trim()
        ?.takeIf { it.isNotBlank() }

    fun subgraphUrlFromBase(baseUrl: String?, path: String): String? =
      baseUrl
        ?.trim()
        ?.removeSuffix("/")
        ?.takeIf { it.isNotBlank() }
        ?.let { "$it$path" }

    val subgraphBaseUrl = projectStringProperty("SUBGRAPH_BASE_URL")
    val subgraphMusicSocialUrl =
      projectStringProperty("SUBGRAPH_MUSIC_SOCIAL_URL")
        ?: subgraphUrlFromBase(subgraphBaseUrl, "/subgraphs/name/dotheaven/music-social-tempo")
        ?: "https://graph.dotheaven.org/subgraphs/name/dotheaven/music-social-tempo"
    buildConfigField("String", "SUBGRAPH_MUSIC_SOCIAL_URL", "\"$subgraphMusicSocialUrl\"")

    val subgraphProfilesUrl =
      projectStringProperty("SUBGRAPH_PROFILES_URL")
        ?: subgraphUrlFromBase(subgraphBaseUrl, "/subgraphs/name/dotheaven/profiles-tempo")
        ?: "https://graph.dotheaven.org/subgraphs/name/dotheaven/profiles-tempo"
    buildConfigField("String", "SUBGRAPH_PROFILES_URL", "\"$subgraphProfilesUrl\"")

    val subgraphPlaylistsUrl =
      projectStringProperty("SUBGRAPH_PLAYLISTS_URL")
        ?: subgraphUrlFromBase(subgraphBaseUrl, "/subgraphs/name/dotheaven/playlist-feed-tempo")
        ?: "https://graph.dotheaven.org/subgraphs/name/dotheaven/playlist-feed-tempo"
    buildConfigField("String", "SUBGRAPH_PLAYLISTS_URL", "\"$subgraphPlaylistsUrl\"")

    val subgraphStudyProgressUrl =
      projectStringProperty("SUBGRAPH_STUDY_PROGRESS_URL")
        ?: subgraphUrlFromBase(subgraphBaseUrl, "/subgraphs/name/dotheaven/study-progress-tempo")
        ?: "https://graph.dotheaven.org/subgraphs/name/dotheaven/study-progress-tempo"
    buildConfigField("String", "SUBGRAPH_STUDY_PROGRESS_URL", "\"$subgraphStudyProgressUrl\"")

    val tempoFollowV1 = projectStringProperty("TEMPO_FOLLOW_V1")
      ?: "0x153DbEcA0CEF8563649cf475a687D14997D2c403"
    buildConfigField("String", "TEMPO_FOLLOW_V1", "\"$tempoFollowV1\"")
  }

  buildFeatures {
    compose = true
    buildConfig = true
  }

  compileOptions {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
  }

  kotlinOptions {
    jvmTarget = "17"
  }

  packaging {
    resources {
      excludes += "/META-INF/{AL2.0,LGPL2.1}"
      excludes += "/META-INF/DISCLAIMER"
    }
    jniLibs {
      useLegacyPackaging = true
    }
  }
}

dependencies {
  // Compose
  implementation(platform("androidx.compose:compose-bom:2026.02.00"))
  implementation("androidx.activity:activity-compose:1.12.4")
  implementation("androidx.compose.ui:ui")
  implementation("androidx.compose.ui:ui-tooling-preview")
  implementation("androidx.compose.material3:material3")
  implementation("androidx.compose.material:material-icons-extended")
  implementation("androidx.navigation:navigation-compose:2.9.7")
  implementation("androidx.fragment:fragment-ktx:1.8.9")
  implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.10.0")

  // Native passkeys
  implementation("androidx.credentials:credentials:1.2.2")
  implementation("androidx.credentials:credentials-play-services-auth:1.2.2")
  implementation("com.upokecenter:cbor:4.5.3") {
    exclude(group = "com.github.peteroupc", module = "datautilities")
  }

  // HTTP + crypto helpers (for Lit auth service + WebAuthn authMethodId derivation)
  implementation("com.squareup.okhttp3:okhttp:4.12.0")
  implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")
  implementation("org.bouncycastle:bcprov-jdk18on:1.83")
  // Ethereum ABI encoding/decoding for AA (ERC-4337) scrobble submits.
  implementation("org.web3j:abi:4.12.2")
  implementation("org.web3j:crypto:4.12.2")

  // Agora RTC (voice calls)
  implementation("io.agora.rtc:full-sdk:4.5.1")

  // XMTP messaging
  implementation("org.xmtp:android:4.9.0")

  // Image loading (album art, covers)
  implementation("io.coil-kt:coil-compose:2.6.0")

  // Glance (home-screen widget)
  implementation("androidx.glance:glance-appwidget:1.1.1")
  implementation("androidx.datastore:datastore-preferences:1.1.4")

  // Media3 ExoPlayer for resilient HTTP streaming with cache
  implementation("androidx.media3:media3-exoplayer:1.4.1")
  implementation("androidx.media3:media3-datasource:1.4.1")
  implementation("androidx.media3:media3-database:1.4.1")

  debugImplementation("androidx.compose.ui:ui-tooling")
}
