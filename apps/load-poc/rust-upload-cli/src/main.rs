use anyhow::{Context, Result, anyhow};
use clap::Parser;
use rand::RngCore;
use reqwest::{Client, StatusCode, multipart};
use serde::Serialize;
use serde_json::Value;
use std::{
    cmp::Ordering,
    fs::{File, create_dir_all, remove_dir_all},
    io::Write,
    path::{Path, PathBuf},
    sync::Arc,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tokio::sync::Semaphore;

#[derive(Debug, Clone, Parser)]
#[command(name = "rust-upload-cli")]
#[command(about = "Rust LS3 upload + resolve benchmark")]
struct Args {
    #[arg(long, env = "LOAD_S3_AGENT_URL", default_value = "https://load-s3-agent.load.network")]
    agent_url: String,

    #[arg(long, env = "LOAD_S3_AGENT_UPLOAD_PATH", default_value = "/upload")]
    upload_path: String,

    #[arg(long, env = "LOAD_GATEWAY_URL", default_value = "https://gateway.s3-node-1.load.network")]
    gateway_url: String,

    #[arg(long, env = "LOAD_S3_AGENT_API_KEY")]
    api_key: String,

    #[arg(long, default_value = "1,5,15")]
    sizes_mb: String,

    #[arg(long, default_value_t = 3)]
    iterations: u32,

    #[arg(long, default_value_t = 2)]
    concurrency: usize,

    #[arg(long, default_value_t = true)]
    verify_resolve: bool,

    #[arg(long, default_value_t = 2048)]
    resolve_range_bytes: usize,

    #[arg(long)]
    report_path: Option<PathBuf>,
}

#[derive(Debug, Clone)]
struct Job {
    size_mb: u32,
    iteration: u32,
    file_path: PathBuf,
    file_size_bytes: usize,
}

#[derive(Debug, Clone, Serialize)]
struct UploadResult {
    size_mb: u32,
    size_bytes: usize,
    iteration: u32,
    started_at_unix_ms: u128,
    upload_duration_ms: f64,
    resolve_duration_ms: Option<f64>,
    total_duration_ms: f64,
    upload_id: Option<String>,
    gateway_url: Option<String>,
    ok: bool,
    error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
struct ReportMeta {
    generated_at_unix_ms: u128,
    duration_ms: u128,
}

#[derive(Debug, Clone, Serialize)]
struct Report {
    meta: ReportMeta,
    args: SerializableArgs,
    results: Vec<UploadResult>,
}

#[derive(Debug, Clone, Serialize)]
struct SerializableArgs {
    agent_url: String,
    upload_path: String,
    gateway_url: String,
    api_key_redacted: String,
    sizes_mb: Vec<u32>,
    iterations: u32,
    concurrency: usize,
    verify_resolve: bool,
    resolve_range_bytes: usize,
    report_path: Option<String>,
}

fn now_unix_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or(Duration::from_millis(0))
        .as_millis()
}

fn parse_sizes(input: &str) -> Result<Vec<u32>> {
    let mut out: Vec<u32> = input
        .split(',')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| s.parse::<u32>())
        .collect::<std::result::Result<Vec<_>, _>>()
        .context("invalid --sizes-mb")?;
    out.retain(|v| *v > 0);
    out.sort_unstable();
    out.dedup();
    if out.is_empty() {
        return Err(anyhow!("sizes_mb produced no valid values"));
    }
    Ok(out)
}

fn mib_to_bytes(mib: u32) -> usize {
    (mib as usize) * 1024 * 1024
}

fn write_random_file(path: &Path, size_bytes: usize) -> Result<()> {
    let mut file = File::create(path).with_context(|| format!("create {}", path.display()))?;
    let mut remaining = size_bytes;
    let mut buf = vec![0u8; 1024 * 1024];
    while remaining > 0 {
        let write_len = remaining.min(buf.len());
        rand::thread_rng().fill_bytes(&mut buf[..write_len]);
        file.write_all(&buf[..write_len])
            .with_context(|| format!("write {}", path.display()))?;
        remaining -= write_len;
    }
    Ok(())
}

fn setup_fixture_files(sizes: &[u32]) -> Result<(PathBuf, Vec<(u32, PathBuf, usize)>)> {
    let tmp_root = std::env::temp_dir().join(format!("load-rust-poc-{}", now_unix_ms()));
    create_dir_all(&tmp_root).with_context(|| format!("create {}", tmp_root.display()))?;

    let mut out = Vec::new();
    for size_mb in sizes {
        let file_path = tmp_root.join(format!("fixture-{}MiB.bin", size_mb));
        let size_bytes = mib_to_bytes(*size_mb);
        write_random_file(&file_path, size_bytes)?;
        out.push((*size_mb, file_path, size_bytes));
    }
    Ok((tmp_root, out))
}

fn build_jobs(fixtures: &[(u32, PathBuf, usize)], iterations: u32) -> Vec<Job> {
    let mut jobs = Vec::new();
    for (size_mb, file_path, size_bytes) in fixtures {
        for i in 1..=iterations {
            jobs.push(Job {
                size_mb: *size_mb,
                iteration: i,
                file_path: file_path.clone(),
                file_size_bytes: *size_bytes,
            });
        }
    }
    jobs
}

fn upload_url(agent_url: &str, upload_path: &str) -> String {
    let path = if upload_path.starts_with('/') {
        upload_path.to_string()
    } else {
        format!("/{}", upload_path)
    };
    format!("{}{}", agent_url.trim_end_matches('/'), path)
}

fn extract_upload_id(v: &Value) -> Option<String> {
    let candidates = [
        v.get("id"),
        v.get("dataitemId"),
        v.get("dataitem_id"),
        v.get("receipt").and_then(|r| r.get("id")),
        v.get("result").and_then(|r| r.get("id")),
        v.get("result")
            .and_then(|r| r.get("receipt"))
            .and_then(|r| r.get("id")),
    ];

    for candidate in candidates {
        if let Some(Value::String(s)) = candidate {
            if !s.trim().is_empty() {
                return Some(s.clone());
            }
        }
    }
    None
}

async fn upload_once(client: &Client, args: &Args, job: &Job) -> Result<(String, Value)> {
    let bytes = tokio::fs::read(&job.file_path)
        .await
        .with_context(|| format!("read {}", job.file_path.display()))?;

    let part = multipart::Part::bytes(bytes)
        .mime_str("application/octet-stream")
        .context("set mime type")?
        .file_name(
            job.file_path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("upload.bin")
                .to_string(),
        );

    let tags = serde_json::json!([
        {"name": "App-Name", "value": "Heaven Load Rust PoC"},
        {"name": "PoC", "value": "load-network-replacement-eval"}
    ]);

    let form = multipart::Form::new()
        .part("file", part)
        .text("content_type", "application/octet-stream")
        .text("tags", tags.to_string());

    let url = upload_url(&args.agent_url, &args.upload_path);
    let res = client
        .post(url)
        .bearer_auth(&args.api_key)
        .multipart(form)
        .send()
        .await
        .context("upload request failed")?;

    let status = res.status();
    let body_text = res.text().await.unwrap_or_else(|_| String::new());
    if !status.is_success() {
        return Err(anyhow!(
            "upload failed ({}) {}",
            status.as_u16(),
            truncate(&body_text, 400)
        ));
    }

    let json: Value = serde_json::from_str(&body_text)
        .with_context(|| format!("upload response not JSON: {}", truncate(&body_text, 400)))?;
    let id = extract_upload_id(&json)
        .ok_or_else(|| anyhow!("upload response missing id: {}", truncate(&body_text, 400)))?;
    Ok((id, json))
}

async fn verify_resolve(
    client: &Client,
    gateway_url: &str,
    upload_id: &str,
    range_bytes: usize,
) -> Result<()> {
    let url = format!(
        "{}/resolve/{}",
        gateway_url.trim_end_matches('/'),
        upload_id
    );
    let end = range_bytes.saturating_sub(1);
    let res = client
        .get(url)
        .header("Range", format!("bytes=0-{}", end))
        .send()
        .await
        .context("resolve request failed")?;

    match res.status() {
        StatusCode::OK | StatusCode::PARTIAL_CONTENT => Ok(()),
        other => {
            let body = res.text().await.unwrap_or_else(|_| String::new());
            Err(anyhow!(
                "resolve failed ({}) {}",
                other.as_u16(),
                truncate(&body, 300)
            ))
        }
    }
}

fn truncate(input: &str, max: usize) -> String {
    if input.len() <= max {
        input.to_string()
    } else {
        format!("{}...", &input[..max])
    }
}

async fn run_job(client: &Client, args: &Args, job: Job) -> UploadResult {
    let started_at = now_unix_ms();
    let upload_start = Instant::now();

    match upload_once(client, args, &job).await {
        Ok((upload_id, _raw)) => {
            let upload_duration_ms = upload_start.elapsed().as_secs_f64() * 1000.0;

            let mut resolve_duration_ms = None;
            if args.verify_resolve {
                let resolve_start = Instant::now();
                let resolve_res = verify_resolve(
                    client,
                    &args.gateway_url,
                    &upload_id,
                    args.resolve_range_bytes,
                )
                .await;
                match resolve_res {
                    Ok(_) => {
                        resolve_duration_ms = Some(resolve_start.elapsed().as_secs_f64() * 1000.0)
                    }
                    Err(err) => {
                        let total_duration_ms = upload_start.elapsed().as_secs_f64() * 1000.0;
                        return UploadResult {
                            size_mb: job.size_mb,
                            size_bytes: job.file_size_bytes,
                            iteration: job.iteration,
                            started_at_unix_ms: started_at,
                            upload_duration_ms,
                            resolve_duration_ms: None,
                            total_duration_ms,
                            upload_id: Some(upload_id.clone()),
                            gateway_url: Some(format!(
                                "{}/resolve/{}",
                                args.gateway_url.trim_end_matches('/'),
                                upload_id
                            )),
                            ok: false,
                            error: Some(err.to_string()),
                        };
                    }
                }
            }

            let total_duration_ms = upload_start.elapsed().as_secs_f64() * 1000.0;
            UploadResult {
                size_mb: job.size_mb,
                size_bytes: job.file_size_bytes,
                iteration: job.iteration,
                started_at_unix_ms: started_at,
                upload_duration_ms,
                resolve_duration_ms,
                total_duration_ms,
                upload_id: Some(upload_id.clone()),
                gateway_url: Some(format!(
                    "{}/resolve/{}",
                    args.gateway_url.trim_end_matches('/'),
                    upload_id
                )),
                ok: true,
                error: None,
            }
        }
        Err(err) => {
            let total_duration_ms = upload_start.elapsed().as_secs_f64() * 1000.0;
            UploadResult {
                size_mb: job.size_mb,
                size_bytes: job.file_size_bytes,
                iteration: job.iteration,
                started_at_unix_ms: started_at,
                upload_duration_ms: total_duration_ms,
                resolve_duration_ms: None,
                total_duration_ms,
                upload_id: None,
                gateway_url: None,
                ok: false,
                error: Some(err.to_string()),
            }
        }
    }
}

fn mean(values: &[f64]) -> f64 {
    if values.is_empty() {
        0.0
    } else {
        values.iter().sum::<f64>() / values.len() as f64
    }
}

fn percentile(values: &[f64], p: f64) -> f64 {
    if values.is_empty() {
        return 0.0;
    }
    let mut sorted = values.to_vec();
    sorted.sort_by(|a, b| a.partial_cmp(b).unwrap_or(Ordering::Equal));
    let idx = ((p / 100.0) * sorted.len() as f64).ceil() as usize;
    let idx = idx.saturating_sub(1).min(sorted.len() - 1);
    sorted[idx]
}

fn print_summary(results: &[UploadResult], sizes: &[u32]) {
    println!("\n=== Summary (ls3-agent) ===");
    println!(
        "size(MiB)  runs  success  fail  avg_upload   p50_upload   p95_upload   avg_throughput"
    );

    for size in sizes {
        let rows: Vec<&UploadResult> = results.iter().filter(|r| r.size_mb == *size).collect();
        let ok_rows: Vec<&UploadResult> = rows.iter().filter(|r| r.ok).copied().collect();
        let uploads: Vec<f64> = ok_rows.iter().map(|r| r.upload_duration_ms).collect();
        let rates: Vec<f64> = ok_rows
            .iter()
            .map(|r| *size as f64 / (r.upload_duration_ms / 1000.0))
            .collect();

        println!(
            "{:>9}  {:>4}  {:>7}  {:>4}  {:>10.1}ms  {:>10.1}ms  {:>10.1}ms  {:>12.2} MiB/s",
            size,
            rows.len(),
            ok_rows.len(),
            rows.len().saturating_sub(ok_rows.len()),
            mean(&uploads),
            percentile(&uploads, 50.0),
            percentile(&uploads, 95.0),
            mean(&rates)
        );
    }
}

fn default_report_path() -> PathBuf {
    PathBuf::from("reports").join(format!("load-rust-poc-{}.json", now_unix_ms()))
}

#[tokio::main]
async fn main() -> Result<()> {
    let args = Args::parse();
    let sizes = parse_sizes(&args.sizes_mb)?;
    let start_all = Instant::now();

    let (tmp_root, fixtures) = setup_fixture_files(&sizes)?;
    let jobs = build_jobs(&fixtures, args.iterations);

    println!("Rust upload PoC");
    println!("agent_url: {}", args.agent_url);
    println!("gateway_url: {}", args.gateway_url);
    println!("sizes_mib: {:?}", sizes);
    println!("iterations: {}", args.iterations);
    println!("concurrency: {}", args.concurrency);
    println!("verify_resolve: {}", args.verify_resolve);
    println!("prepared_jobs: {}", jobs.len());

    let client = Client::builder()
        .timeout(Duration::from_secs(300))
        .build()
        .context("build http client")?;

    let sem = Arc::new(Semaphore::new(args.concurrency.max(1)));
    let mut handles = Vec::with_capacity(jobs.len());
    for job in jobs {
        let permit = sem.clone().acquire_owned().await.context("acquire semaphore")?;
        let client = client.clone();
        let args_clone = args.clone();
        handles.push(tokio::spawn(async move {
            let _permit = permit;
            run_job(&client, &args_clone, job).await
        }));
    }

    let mut results = Vec::new();
    for handle in handles {
        results.push(handle.await.context("join task")?);
    }

    print_summary(&results, &sizes);

    let report_path = args.report_path.clone().unwrap_or_else(default_report_path);
    if let Some(parent) = report_path.parent() {
        create_dir_all(parent).with_context(|| format!("create {}", parent.display()))?;
    }

    let report = Report {
        meta: ReportMeta {
            generated_at_unix_ms: now_unix_ms(),
            duration_ms: start_all.elapsed().as_millis(),
        },
        args: SerializableArgs {
            agent_url: args.agent_url.clone(),
            upload_path: args.upload_path.clone(),
            gateway_url: args.gateway_url.clone(),
            api_key_redacted: if args.api_key.len() > 8 {
                format!("{}...", &args.api_key[..8])
            } else {
                "***".to_string()
            },
            sizes_mb: sizes.clone(),
            iterations: args.iterations,
            concurrency: args.concurrency,
            verify_resolve: args.verify_resolve,
            resolve_range_bytes: args.resolve_range_bytes,
            report_path: Some(report_path.display().to_string()),
        },
        results: results.clone(),
    };

    let json = serde_json::to_string_pretty(&report).context("serialize report")?;
    std::fs::write(&report_path, json).with_context(|| format!("write {}", report_path.display()))?;
    println!("\nReport written: {}", report_path.display());

    let failures: Vec<&UploadResult> = results.iter().filter(|r| !r.ok).collect();
    if !failures.is_empty() {
        println!("Failures: {}/{}", failures.len(), results.len());
        for failure in failures.iter().take(5) {
            println!(
                "- {}MiB #{}: {}",
                failure.size_mb,
                failure.iteration,
                failure.error.clone().unwrap_or_else(|| "unknown error".to_string())
            );
        }
    }

    if tmp_root.exists() {
        let _ = remove_dir_all(tmp_root);
    }

    if !failures.is_empty() {
        std::process::exit(1);
    }

    Ok(())
}
