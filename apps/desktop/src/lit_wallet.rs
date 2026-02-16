//! Lit wallet/auth/action service for GPUI.
//!
//! This module provides a thin synchronous facade over `lit-rust-sdk` so the
//! GPUI app can:
//! - build PKP auth context from persisted auth data
//! - execute Lit Actions natively from Rust
//! - sign payloads with PKP (via Lit nodes)

use std::env;

use alloy_primitives::{keccak256, Address};
use ethers::middleware::SignerMiddleware;
use ethers::providers::{Http, Middleware, Provider};
use ethers::signers::Signer;
use ethers::types::{Address as EthersAddress, BlockId, TransactionRequest, U256 as EthersU256};
use ethers::utils::parse_ether;

use lit_rust_sdk::{
    create_eth_wallet_auth_data, create_lit_client, naga_dev, naga_mainnet, naga_proto,
    naga_staging, naga_test, AuthConfig, AuthContext, AuthData, DecryptParams, DecryptResponse,
    EncryptParams, EncryptResponse, ExecuteJsResponse, LitAbility, LitClient, NetworkConfig,
    PkpSigner, ResourceAbilityRequest,
};

use crate::auth::PersistedAuth;

mod auth_bootstrap_helpers;
mod impl_crypto_and_authctx;
mod impl_init_and_execute;
mod impl_signing_and_tx;
mod signature_helpers;

#[derive(Debug, Clone)]
pub struct LitInitStatus {
    pub network: String,
    pub pkp_address: String,
}

pub struct LitWalletService {
    runtime: tokio::runtime::Runtime,
    client: Option<LitClient>,
    auth_context: Option<AuthContext>,
    pkp_public_key: Option<String>,
    pkp_address: Option<String>,
    network: Option<String>,
}
