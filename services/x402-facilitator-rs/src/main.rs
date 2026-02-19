use std::env;
use std::net::SocketAddr;
use std::sync::Arc;

use axum::Json;
use axum::extract::State;
use axum::http::{Method, StatusCode};
use axum::middleware::{self, Next};
use axum::response::IntoResponse;
use axum::routing::{get, post};
use axum::Router;
use serde::Deserialize;
use serde_json::{Value, json};
use tracing::{info, warn};
use tracing_subscriber::EnvFilter;
use url::Url;

use x402_facilitator::facilitator_local::FacilitatorLocal;
use x402_facilitator::facilitator::Facilitator;
use x402_facilitator::provider_cache::ProviderCache;
use x402_facilitator::types::{PaymentPayload, PaymentRequirements, Scheme, SettleRequest, TokenAmount, VerifyRequest};

fn facilitator_auth_token() -> String {
    env::var("FACILITATOR_AUTH_TOKEN")
        .or_else(|_| env::var("X402_FACILITATOR_AUTH_TOKEN"))
        .unwrap_or_default()
}

fn bind_host() -> String {
    env::var("FACILITATOR_HOST").unwrap_or_else(|_| "0.0.0.0".to_string())
}

fn bind_port() -> u16 {
    // EigenCompute commonly injects APP_PORT.
    let raw = env::var("FACILITATOR_PORT")
        .or_else(|_| env::var("APP_PORT"))
        .unwrap_or_else(|_| "3340".to_string());
    raw.trim().parse::<u16>().unwrap_or(3340)
}

async fn bearer_auth_layer(req: axum::http::Request<axum::body::Body>, next: Next) -> impl IntoResponse {
    // Only protect mutating endpoints. Session-voice only calls POST /settle.
    if req.method() != Method::POST {
        return next.run(req).await;
    }

    let expected = req
        .extensions()
        .get::<Arc<String>>()
        .map(|s| s.as_str())
        .unwrap_or("");

    if expected.trim().is_empty() {
        warn!("missing FACILITATOR_AUTH_TOKEN (or X402_FACILITATOR_AUTH_TOKEN); refusing POST");
        return (StatusCode::INTERNAL_SERVER_ERROR, "facilitator_auth_not_configured").into_response();
    }

    let provided = req
        .headers()
        .get("authorization")
        .and_then(|h| h.to_str().ok())
        .unwrap_or("");

    let ok = provided.strip_prefix("Bearer ").map(|v| v == expected).unwrap_or(false);
    if !ok {
        return (StatusCode::UNAUTHORIZED, "unauthorized").into_response();
    }

    next.run(req).await
}

type FacState = Arc<FacilitatorLocal<ProviderCache>>;

async fn health(State(facilitator): State<FacState>) -> impl IntoResponse {
    supported(State(facilitator)).await
}

async fn supported(State(facilitator): State<FacState>) -> impl IntoResponse {
    match facilitator.supported().await {
        Ok(supported) => (StatusCode::OK, Json(json!(supported))).into_response(),
        Err(error) => error.into_response(),
    }
}

async fn root() -> impl IntoResponse {
    (StatusCode::OK, "heaven-x402-facilitator")
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LegacyPaymentRequirements {
    scheme: Option<String>,
    network: String,
    asset: String,
    #[serde(alias = "pay_to")]
    pay_to: String,
    resource: String,
    amount: Option<String>,
    max_amount_required: Option<String>,
    max_timeout_seconds: Option<u64>,
    extra: Option<Value>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LegacySettleRequest {
    x402_version: Option<u8>,
    payment_payload: Value,
    payment_requirements: LegacyPaymentRequirements,
}

fn normalize_resource_to_url(raw: &str) -> Result<Url, url::ParseError> {
    if let Ok(url) = Url::parse(raw) {
        return Ok(url);
    }

    let mut path = raw.trim().to_string();
    if !path.starts_with('/') {
        path.insert(0, '/');
    }
    Url::parse(&format!("http://localhost{path}"))
}

fn to_token_amount_string(req: &LegacyPaymentRequirements) -> Option<String> {
    req.max_amount_required
        .clone()
        .or_else(|| req.amount.clone())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

fn coerce_payment_payload(raw: Value) -> Result<PaymentPayload, String> {
    if let Ok(payload) = serde_json::from_value::<PaymentPayload>(raw.clone()) {
        return Ok(payload);
    }

    let scheme = raw
        .get("scheme")
        .and_then(|v| v.as_str())
        .or_else(|| raw.pointer("/accepted/scheme").and_then(|v| v.as_str()))
        .ok_or_else(|| "invalid paymentPayload: missing scheme (expected paymentPayload.scheme or paymentPayload.accepted.scheme)".to_string())?;

    let network = raw
        .get("network")
        .and_then(|v| v.as_str())
        .or_else(|| raw.pointer("/accepted/network").and_then(|v| v.as_str()))
        .ok_or_else(|| "invalid paymentPayload: missing network (expected paymentPayload.network or paymentPayload.accepted.network)".to_string())?;

    let payload = raw
        .get("payload")
        .cloned()
        .ok_or_else(|| "invalid paymentPayload: missing payload".to_string())?;

    let signature = payload
        .get("signature")
        .cloned()
        .ok_or_else(|| "invalid paymentPayload: missing payload.signature".to_string())?;

    let authorization = payload
        .get("authorization")
        .cloned()
        .ok_or_else(|| "invalid paymentPayload: missing payload.authorization".to_string())?;

    let coerced = json!({
        "x402Version": 1,
        "scheme": scheme,
        "network": network,
        "payload": {
            "signature": signature,
            "authorization": authorization,
        }
    });

    serde_json::from_value::<PaymentPayload>(coerced)
        .map_err(|e| format!("invalid paymentPayload: {e}"))
}

fn map_legacy_settle_to_x402(req: LegacySettleRequest) -> Result<VerifyRequest, String> {
    let x402_version = req.x402_version.unwrap_or(1);
    let payment_payload: PaymentPayload = coerce_payment_payload(req.payment_payload)?;

    let amount = to_token_amount_string(&req.payment_requirements)
        .ok_or_else(|| "missing paymentRequirements.maxAmountRequired (or amount)".to_string())?;

    let network = serde_json::from_value::<x402_facilitator::network::Network>(Value::String(req.payment_requirements.network))
        .map_err(|e| format!("invalid paymentRequirements.network: {e}"))?;

    let max_amount_required = serde_json::from_value::<TokenAmount>(Value::String(amount))
        .map_err(|e| format!("invalid paymentRequirements.maxAmountRequired: {e}"))?;

    let pay_to = serde_json::from_value(Value::String(req.payment_requirements.pay_to))
        .map_err(|e| format!("invalid paymentRequirements.payTo: {e}"))?;

    let asset = serde_json::from_value(Value::String(req.payment_requirements.asset))
        .map_err(|e| format!("invalid paymentRequirements.asset: {e}"))?;

    let resource = normalize_resource_to_url(&req.payment_requirements.resource)
        .map_err(|e| format!("invalid paymentRequirements.resource: {e}"))?;

    let payment_requirements = PaymentRequirements {
        scheme: Scheme::Exact,
        network,
        max_amount_required,
        resource,
        description: "".to_string(),
        mime_type: "application/json".to_string(),
        output_schema: None,
        pay_to,
        max_timeout_seconds: req.payment_requirements.max_timeout_seconds.unwrap_or(60 * 60),
        asset,
        extra: req.payment_requirements.extra,
    };

    let x402_version = serde_json::from_value(Value::Number(x402_version.into()))
        .map_err(|e| format!("invalid x402Version: {e}"))?;

    Ok(VerifyRequest {
        x402_version,
        payment_payload,
        payment_requirements,
    })
}

async fn post_settle(
    State(facilitator): State<FacState>,
    Json(body): Json<Value>,
) -> impl IntoResponse {
    // First try the native x402-rs request schema.
    if let Ok(req) = serde_json::from_value::<SettleRequest>(body.clone()) {
        return match facilitator.settle(&req).await {
            Ok(res) => (StatusCode::OK, Json(json!(res))).into_response(),
            Err(error) => {
                warn!(error = ?error, "settlement failed (native schema)");
                error.into_response()
            }
        };
    }

    // Fallback: accept the legacy settle schema session-voice currently sends.
    let legacy = match serde_json::from_value::<LegacySettleRequest>(body) {
        Ok(v) => v,
        Err(err) => {
            warn!(error = %err, "failed to parse settle request as legacy schema");
            return (
                StatusCode::UNPROCESSABLE_ENTITY,
                Json(json!({ "error": { "code": "invalid_request_parse", "message": err.to_string() } })),
            )
                .into_response();
        }
    };

    let mapped = match map_legacy_settle_to_x402(legacy) {
        Ok(v) => v,
        Err(message) => {
            warn!(error = %message, "failed to map legacy settle request into x402-rs schema");
            let mut code = message.clone();
            if code.len() > 160 {
                code.truncate(160);
            }
            return (
                StatusCode::UNPROCESSABLE_ENTITY,
                Json(json!({ "error": { "code": code, "message": message } })),
            )
                .into_response();
        }
    };

    match facilitator.settle(&mapped).await {
        Ok(res) => (StatusCode::OK, Json(json!(res))).into_response(),
        Err(error) => {
            warn!(error = ?error, "settlement failed (mapped legacy schema)");
            error.into_response()
        }
    }
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::from_default_env().add_directive("info".parse().unwrap()))
        .init();

    // Hard requirements for production posture.
    // Note: the upstream x402-facilitator crate also requires signer + rpc env,
    // but we enforce the auth token here because session-voice depends on it.
    let auth = facilitator_auth_token();
    if auth.trim().is_empty() {
        // We still start so /health can explain what's wrong, but POSTs will 500.
        warn!("FACILITATOR_AUTH_TOKEN is not set; POST endpoints will refuse requests");
    }

    // Provider + signer come from the upstream env contract.
    // See x402-facilitator docs: RPC_URL_BASE_SEPOLIA, SIGNER_TYPE=raw, EVM_PRIVATE_KEY, etc.
    // We call into upstream helpers so we don't re-implement EIP-3009 settlement.
    let provider_cache = ProviderCache::from_env()
        .await
        .expect("failed to load provider cache from env");
    let facilitator = Arc::new(FacilitatorLocal::new(provider_cache));

    let mut app = Router::new()
        .route("/", get(root))
        .route("/health", get(health))
        .route("/supported", get(supported))
        .route("/settle", post(post_settle))
        .with_state(facilitator.clone())
        .layer(middleware::from_fn(bearer_auth_layer));

    // Make auth token available to middleware via extensions.
    app = app.layer(axum::Extension(Arc::new(auth)));

    let addr: SocketAddr = format!("{}:{}", bind_host(), bind_port())
        .parse()
        .expect("invalid FACILITATOR_HOST/FACILITATOR_PORT");
    info!("x402 facilitator listening on http://{addr}");

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
