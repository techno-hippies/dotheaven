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

  // XMTP messaging
  implementation("org.xmtp:android:4.9.0")

  // Image loading (album art, covers)
  implementation("io.coil-kt:coil-compose:2.6.0")

  debugImplementation("androidx.compose.ui:ui-tooling")
}
