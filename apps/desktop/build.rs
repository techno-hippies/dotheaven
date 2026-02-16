use std::env;
use std::path::PathBuf;
use std::process::Command;

fn main() {
    println!("cargo:rerun-if-changed=build.rs");
    println!("cargo:rerun-if-changed=logo.png");
    println!("cargo:rerun-if-changed=assets/app_icon/icon.png");
    println!("cargo:rerun-if-changed=assets/app_icon/icon.ico");
    println!("cargo:rerun-if-changed=native/agora_bridge/include/heaven_agora_bridge.h");
    println!("cargo:rerun-if-changed=native/agora_bridge/src/heaven_agora_bridge.cpp");
    println!("cargo:rerun-if-env-changed=AGORA_SDK_ROOT");
    println!("cargo:rerun-if-env-changed=AGORA_SDK_LIB_NAME");

    maybe_embed_windows_icon();

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

    // Rebuild when SDK contents change (same path, different extracted version).
    println!("cargo:rerun-if-changed={}", include_dir.display());
    println!("cargo:rerun-if-changed={}", lib_dir.display());

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

fn maybe_embed_windows_icon() {
    if env::var("CARGO_CFG_TARGET_OS").as_deref() != Ok("windows") {
        return;
    }

    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap());
    let icon_path = manifest_dir.join("assets/app_icon/icon.ico");
    if !icon_path.exists() {
        println!(
            "cargo:warning=Windows icon not found at {}; skipping icon embedding",
            icon_path.display()
        );
        return;
    }

    let out_dir = PathBuf::from(env::var("OUT_DIR").unwrap());
    let rc_path = out_dir.join("heaven_icon.rc");
    let res_path = out_dir.join("heaven_icon.res");

    // Use forward slashes to avoid escaping issues in rc syntax.
    let icon_str = icon_path.to_string_lossy().replace('\\', "/");
    std::fs::write(&rc_path, format!("1 ICON \"{icon_str}\"\n"))
        .expect("write windows icon rc file");

    let target_env = env::var("CARGO_CFG_TARGET_ENV").unwrap_or_default();
    let mut last_err: Option<String> = None;

    let ok = if target_env == "gnu" {
        try_windres(&rc_path, &res_path, &mut last_err)
    } else {
        // Prefer MSVC rc/llvm-rc when available.
        try_rc_msvc(&rc_path, &res_path, &mut last_err)
            || try_llvm_rc(&rc_path, &res_path, &mut last_err)
            || try_windres(&rc_path, &res_path, &mut last_err)
    };

    if !ok {
        println!(
            "cargo:warning=Unable to embed Windows icon (build will continue without it): {}",
            last_err.unwrap_or_else(|| "unknown error".to_string())
        );
        return;
    }

    // The Windows linker accepts `.res` inputs directly.
    println!("cargo:rustc-link-arg={}", res_path.display());
}

fn try_rc_msvc(rc_path: &PathBuf, res_path: &PathBuf, last_err: &mut Option<String>) -> bool {
    if let Ok(tool) = env::var("RC") {
        return run_tool(
            &tool,
            &[
                "/nologo".to_string(),
                "/fo".to_string(),
                res_path.display().to_string(),
                rc_path.display().to_string(),
            ],
            last_err,
        );
    }

    run_tool(
        "rc",
        &[
            "/nologo".to_string(),
            "/fo".to_string(),
            res_path.display().to_string(),
            rc_path.display().to_string(),
        ],
        last_err,
    )
}

fn try_llvm_rc(rc_path: &PathBuf, res_path: &PathBuf, last_err: &mut Option<String>) -> bool {
    run_tool(
        "llvm-rc",
        &[
            "/fo".to_string(),
            res_path.display().to_string(),
            rc_path.display().to_string(),
        ],
        last_err,
    )
}

fn try_windres(rc_path: &PathBuf, res_path: &PathBuf, last_err: &mut Option<String>) -> bool {
    run_tool(
        "windres",
        &[
            "-O".to_string(),
            "coff".to_string(),
            "-o".to_string(),
            res_path.display().to_string(),
            rc_path.display().to_string(),
        ],
        last_err,
    )
}

fn run_tool(tool: &str, args: &[String], last_err: &mut Option<String>) -> bool {
    let output = match Command::new(tool).args(args).output() {
        Ok(output) => output,
        Err(err) => {
            *last_err = Some(format!("{tool}: {err}"));
            return false;
        }
    };

    if output.status.success() {
        return true;
    }

    let stderr = String::from_utf8_lossy(&output.stderr);
    let stdout = String::from_utf8_lossy(&output.stdout);
    *last_err = Some(format!(
        "{tool} failed (exit={}): {}{}",
        output.status,
        stdout.trim(),
        if stderr.trim().is_empty() {
            "".to_string()
        } else if stdout.trim().is_empty() {
            stderr.trim().to_string()
        } else {
            format!("\n{}", stderr.trim())
        }
    ));

    false
}

fn default_agora_lib_name() -> String {
    match env::var("CARGO_CFG_TARGET_OS").as_deref() {
        Ok("windows") => "agora_rtc_sdk".to_string(),
        Ok("macos") => "AgoraRtcKit".to_string(),
        _ => "agora_rtc_sdk".to_string(),
    }
}
