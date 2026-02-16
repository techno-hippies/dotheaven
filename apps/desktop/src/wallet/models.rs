const RPC_SEPOLIA: &str =
    "https://g.w.lavanet.xyz:443/gateway/sep1/rpc-http/69b66aca774b0ee62a86d26675365f07";
const RPC_MEGA_TESTNET_V2: &str = "https://carrot.megaeth.com/rpc";
const RPC_MEGA_MAINNET: &str = "https://mainnet.megaeth.com/rpc";

#[derive(Clone)]
pub(in crate::wallet) struct WalletAssetRow {
    pub(in crate::wallet) symbol: &'static str,
    pub(in crate::wallet) network: &'static str,
    pub(in crate::wallet) balance_text: String,
    pub(in crate::wallet) balance_usd_text: String,
    pub(in crate::wallet) balance_usd_value: f64,
    pub(in crate::wallet) icon: WalletIcon,
    pub(in crate::wallet) chain_badge: WalletIcon,
}

#[derive(Clone, Copy)]
pub(in crate::wallet) struct WalletAssetConfig {
    pub(in crate::wallet) symbol: &'static str,
    pub(in crate::wallet) network: &'static str,
    pub(in crate::wallet) icon: WalletIcon,
    pub(in crate::wallet) chain_badge: WalletIcon,
    pub(in crate::wallet) rpc_url: &'static str,
    pub(in crate::wallet) token_address: Option<&'static str>,
    pub(in crate::wallet) token_decimals: u8,
    pub(in crate::wallet) price_usd: f64,
}

#[derive(Clone, Copy)]
pub(in crate::wallet) enum WalletIcon {
    Usdm,
    Ethereum,
    MegaEth,
}

pub(in crate::wallet) const WALLET_ASSETS: [WalletAssetConfig; 3] = [
    WalletAssetConfig {
        symbol: "ETH",
        network: "Ethereum",
        icon: WalletIcon::Ethereum,
        chain_badge: WalletIcon::Ethereum,
        rpc_url: RPC_SEPOLIA,
        token_address: None,
        token_decimals: 18,
        price_usd: 3090.0,
    },
    WalletAssetConfig {
        symbol: "ETH",
        network: "MegaETH",
        icon: WalletIcon::Ethereum,
        chain_badge: WalletIcon::MegaEth,
        rpc_url: RPC_MEGA_TESTNET_V2,
        token_address: None,
        token_decimals: 18,
        price_usd: 3090.0,
    },
    WalletAssetConfig {
        symbol: "USDM",
        network: "MegaETH",
        icon: WalletIcon::Usdm,
        chain_badge: WalletIcon::MegaEth,
        rpc_url: RPC_MEGA_MAINNET,
        token_address: Some("0xFAfDdbb3FC7688494971a79cc65DCa3EF82079E7"),
        token_decimals: 18,
        price_usd: 1.0,
    },
];

pub(in crate::wallet) fn zero_wallet_assets() -> Vec<WalletAssetRow> {
    WALLET_ASSETS
        .iter()
        .map(|cfg| WalletAssetRow {
            symbol: cfg.symbol,
            network: cfg.network,
            balance_text: "0.0000".to_string(),
            balance_usd_text: "$0.00".to_string(),
            balance_usd_value: 0.0,
            icon: cfg.icon,
            chain_badge: cfg.chain_badge,
        })
        .collect()
}

pub(in crate::wallet) struct WalletBalancesFetchResult {
    pub(in crate::wallet) rows: Vec<WalletAssetRow>,
    pub(in crate::wallet) error: Option<String>,
}
