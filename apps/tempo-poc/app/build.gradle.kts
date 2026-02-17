plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

android {
    namespace = "com.heaven.tempo"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.heaven.tempo"
        minSdk = 28 // Credential Manager needs 28+
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    buildFeatures {
        compose = true
    }
}

dependencies {
    // Compose
    implementation(platform("androidx.compose:compose-bom:2026.02.00"))
    implementation("androidx.activity:activity-compose:1.12.4")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.10.0")
    debugImplementation("androidx.compose.ui:ui-tooling")

    // Passkeys / Credential Manager
    implementation("androidx.credentials:credentials:1.2.2")
    implementation("androidx.credentials:credentials-play-services-auth:1.2.2")

    // CBOR (parse WebAuthn attestation)
    implementation("com.upokecenter:cbor:4.5.3") {
        exclude(group = "com.github.peteroupc", module = "datautilities")
    }

    // HTTP
    implementation("com.squareup.okhttp3:okhttp:4.12.0")

    // Crypto (keccak256 for address derivation)
    implementation("org.bouncycastle:bcprov-jdk18on:1.83")

    // Fragment (for FragmentActivity — needed by CredentialManager)
    implementation("androidx.fragment:fragment-ktx:1.8.8")

    // Coroutines
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")
}
