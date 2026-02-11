use std::env;
use std::path::PathBuf;

fn main() {
    println!("cargo:rerun-if-changed=build.rs");
    println!("cargo:rerun-if-changed=native/agora_bridge/include/heaven_agora_bridge.h");
    println!("cargo:rerun-if-changed=native/agora_bridge/src/heaven_agora_bridge.cpp");

    if env::var("CARGO_FEATURE_AGORA_NATIVE").is_err() {
        return;
    }

    let sdk_root = env::var("AGORA_SDK_ROOT").unwrap_or_else(|_| {
        panic!(
            "agora-native feature enabled but AGORA_SDK_ROOT is not set. \
Set it to the Agora native Voice/RTC SDK root containing include/ and lib/."
        )
    });
    let sdk_root = PathBuf::from(sdk_root);
    let include_dir = sdk_root.join("include");
    let lib_dir = sdk_root.join("lib");

    if !include_dir.exists() {
        panic!(
            "AGORA_SDK_ROOT/include not found at {}",
            include_dir.display()
        );
    }
    if !lib_dir.exists() {
        panic!("AGORA_SDK_ROOT/lib not found at {}", lib_dir.display());
    }

    cc::Build::new()
        .cpp(true)
        .file("native/agora_bridge/src/heaven_agora_bridge.cpp")
        .include("native/agora_bridge/include")
        .include(&include_dir)
        .flag_if_supported("-std=c++17")
        .compile("heaven_agora_bridge");

    println!("cargo:rustc-link-search=native={}", lib_dir.display());
    let sdk_lib_name = env::var("AGORA_SDK_LIB_NAME").unwrap_or_else(|_| default_agora_lib_name());
    println!("cargo:rustc-link-lib=dylib={sdk_lib_name}");

    match env::var("CARGO_CFG_TARGET_OS").as_deref() {
        Ok("linux") => {
            println!("cargo:rustc-link-lib=dylib=stdc++");
        }
        Ok("macos") => {
            println!("cargo:rustc-link-lib=dylib=c++");
        }
        _ => {}
    }
}

fn default_agora_lib_name() -> String {
    match env::var("CARGO_CFG_TARGET_OS").as_deref() {
        Ok("windows") => "agora_rtc_sdk".to_string(),
        Ok("macos") => "AgoraRtcKit".to_string(),
        _ => "agora_rtc_sdk".to_string(),
    }
}
