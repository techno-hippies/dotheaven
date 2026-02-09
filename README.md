# Heaven

A sovereign social network where users karaoke, share and release music, and make new friends.

一个自主的社交网络，用户可以在这里唱卡拉OK、分享和发布音乐、结交新朋友。

---

## Features / 功能

| | English | 中文 |
|---|---|---|
| **Music Streaming** | Cross-device music streaming from your local library | 跨设备播放本地音乐库 |
| **Scrobbling** | On-chain listening history — verified plays written directly to MegaETH | 链上听歌记录——已验证的播放直接写入 MegaETH |
| **Music Publishing** | Publish original music to IPFS with [Story Protocol](https://story.foundation) IP licensing (non-commercial, commercial use, or commercial remix with configurable royalties) | 将原创音乐发布至 IPFS，通过 [Story Protocol](https://story.foundation) 进行知识产权授权（非商业、商业使用或商业混音，可配置版税） |
| **AI Voice** | Real-time AI voice calls via [Agora CAI](https://www.agora.io/en/products/conversational-ai/) (STT → LLM → ElevenLabs TTS) | 通过 [Agora CAI](https://www.agora.io/en/products/conversational-ai/) 实现实时 AI 语音通话（语音识别 → LLM → ElevenLabs 语音合成） |
| **Karaoke Sessions** | Schedule and pay creators for live voice sessions with AI co-host | 预约并支付创作者的现场语音演出，配有 AI 共同主持 |
| **Social Feed** | Post updates with automatic translation across languages | 发布动态，支持多语言自动翻译 |
| **Encrypted Messaging** | Private peer-to-peer encrypted DMs | 端到端加密的私人消息 |
| **Wallet** | Send and receive assets across Ethereum | 在以太坊网络上发送和接收资产 |
| **Playlists** | Create and share playlists as NFTs (ERC-721) | 创建并分享播放列表（ERC-721 NFT） |
| **Identity** | Passkey or EOA login — every user gets a [Lit PKP](https://litprotocol.com) wallet. On-chain profiles, `.heaven` name NFTs (resolvable via [Handshake](https://handshake.org) DNS) | 通行密钥或 EOA 登录——每个用户获得一个 [Lit PKP](https://litprotocol.com) 钱包。链上个人资料、`.heaven` 域名 NFT（通过 [Handshake](https://handshake.org) DNS 可解析） |
| **Verification** | Zero-knowledge passport verification (18+, nationality) | 零知识护照验证（18岁以上、国籍） |

## Apps / 应用

| Platform / 平台 | Stack / 技术栈 | Directory / 目录 |
|---|---|---|
| Web (desktop & mobile) | SolidJS, Vite, Tailwind CSS v4 | `apps/frontend/` |
| Desktop (Mac, Windows, Linux) | Tauri (Rust backend) | `apps/frontend/src-tauri/` |
| Mobile (iOS, Android) | React Native, Expo | `apps/react-native/` |

## Architecture / 架构

```
dotheaven/
├── apps/
│   ├── frontend/          # SolidJS web app + Tauri desktop
│   │   │                  # SolidJS 网页应用 + Tauri 桌面应用
│   │   └── src-tauri/     # Rust backend (native libxmtp, SQLite music DB)
│   │                      # Rust 后端（原生 libxmtp、SQLite 音乐数据库）
│   └── react-native/      # Expo Android/iOS app
│                          # Expo 安卓/iOS 应用
├── packages/
│   ├── ui/                # Shared component library + Storybook
│   │                      # 共享组件库 + Storybook
│   ├── core/              # Business logic (scrobble engine, playlists, routes)
│   │                      # 业务逻辑（播放记录引擎、播放列表、路由）
│   ├── platform/          # Platform-specific utilities
│   │                      # 平台适配工具
│   └── i18n/              # Internationalization (English, Chinese)
│                          # 国际化（英文、中文）
├── contracts/
│   ├── megaeth/           # Core smart contracts (Foundry)
│   │                      # 核心智能合约（Foundry）
│   ├── celo/              # ZK identity verification (Self.xyz)
│   │                      # 零知识身份验证（Self.xyz）
│   └── base/              # Content access mirror
│                          # 内容访问镜像
├── subgraphs/             # Goldsky indexers (activity, profiles, playlists)
│                          # Goldsky 索引器（动态、个人资料、播放列表）
├── services/
│   ├── aa-gateway/        # ERC-4337 account abstraction gateway (EigenCloud TEE)
│   │                      # ERC-4337 账户抽象网关（EigenCloud TEE）
│   ├── alto/              # Pimlico Alto bundler
│   │                      # Pimlico Alto 打包器
│   ├── heaven-api/        # API worker (photos, claims, names)
│   │                      # API 服务（照片、认领、域名）
│   ├── heaven-resolver/   # MusicBrainz proxy + IPFS image rehost
│   │                      # MusicBrainz 代理 + IPFS 图片托管
│   ├── session-voice/     # Voice rooms (Agora + Durable Objects)
│   │                      # 语音房间（Agora + Durable Objects）
│   └── lit-relayer/       # PKP minting relayer
│                          # PKP 铸造中继器
└── lit-actions/           # Lit Protocol actions (gasless signing)
                           # Lit Protocol 操作（无 Gas 签名）
```

## Protocols / 协议

| Protocol / 协议 | Role / 用途 |
|---|---|
| [MegaETH](https://megaeth.com) | Core blockchain — all social, music, and identity contracts / 核心区块链——所有社交、音乐和身份合约 |
| [Celo](https://celo.org) | ZK identity verification via Self.xyz (18+, nationality) / 通过 Self.xyz 进行零知识身份验证 |
| [Base](https://base.org) | Content access mirror (Lit Protocol doesn't natively support MegaETH yet) / 内容访问镜像（Lit Protocol 尚不原生支持 MegaETH） |
| [Lit Protocol](https://litprotocol.com) | PKP wallets (passkey or EOA auth → PKP), encryption, gasless transaction signing / PKP 钱包（通行密钥或 EOA 认证 → PKP）、加密、无 Gas 交易签名 |
| [XMTP](https://xmtp.org) | End-to-end encrypted peer-to-peer messaging / 端到端加密的点对点消息 |
| [Filecoin](https://filecoin.io) | Encrypted file storage for music and media / 加密音乐和媒体文件存储 |
| [Filecoin Beam](https://filbeam.io) | Incentivized data delivery for Filecoin content / Filecoin 内容的激励数据分发 |
| [Story Protocol](https://story.foundation) | IP assignment and licensing for songs / 歌曲的知识产权归属和授权 |
| [IPFS](https://ipfs.tech) (via [Filebase](https://filebase.com)) | Off-chain metadata, cover art, post content / 链下元数据、封面、帖子内容 |
| [Agora](https://agora.io) | WebRTC voice calls and live rooms / WebRTC 语音通话和直播房间 |
| [ERC-4337](https://eips.ethereum.org/EIPS/eip-4337) | Account abstraction — gasless UX via paymaster (contracts from [eth-infinitism](https://github.com/eth-infinitism/account-abstraction) v0.7, bundled by [Pimlico Alto](https://github.com/pimlicolabs/alto), gateway hosted on [EigenCloud TEE](https://eigencloud.com)) / 账户抽象——通过 Paymaster 实现无 Gas 体验（合约来自 [eth-infinitism](https://github.com/eth-infinitism/account-abstraction) v0.7，由 [Pimlico Alto](https://github.com/pimlicolabs/alto) 打包，网关托管于 [EigenCloud TEE](https://eigencloud.com)） |
| [Handshake](https://handshake.org) | Decentralized DNS — `.heaven` TLD (with planned `.⭐` and `.🪽`) resolves user profiles via HNS bridge. ERC-721 name NFTs with ENS bridge compatibility / 去中心化 DNS——`.heaven` 顶级域名（计划推出 `.⭐` 和 `.🪽`）通过 HNS 桥接解析用户资料。ERC-721 域名 NFT，兼容 ENS 桥接 |

## Smart Contracts / 智能合约

Deployed on **MegaETH Testnet** (chain 6343) unless noted.

部署在 **MegaETH 测试网**（链 ID 6343），除非另有说明。

| Contract / 合约 | Address / 地址 | Purpose / 用途 |
|---|---|---|
| RegistryV1 | `0x22B618...01E5` | Multi-TLD name NFTs (ERC-721) — `.heaven`, `.⭐`, `.🪽`. ENS-bridged via CCIP-Read / 多 TLD 域名 NFT（ERC-721）——`.heaven`、`.⭐`、`.🪽`。通过 CCIP-Read 桥接 ENS |
| RecordsV1 | `0x80D1b5...Baf3` | ENS-compatible text records / ENS 兼容文本记录 |
| ProfileV2 | `0xa31545...d4E5` | On-chain social profiles / 链上社交资料 |
| ScrobbleV4 | `0xBcD4Eb...bFA6` | Listening history (AA-enabled) / 播放历史（支持 AA） |
| PlaylistV1 | `0xF03377...f329` | Event-sourced playlists / 事件溯源播放列表 |
| PostsV1 | `0xFe674F...bFA6` | Social feed posts / 社交动态帖子 |
| EngagementV2 | `0xAF769d...6138` | Likes, comments, translations, flags / 点赞、评论、翻译、举报 |
| FollowV1 | `0x3F32cF...6cb` | Social follow graph / 社交关注图谱 |
| LyricsEngagementV1 | `0x6C832a...3EB4` | Song lyrics translations / 歌词翻译 |
| SessionEscrowV1 | — | Karaoke session payments / 卡拉OK 会话支付 |
| SelfProfileVerifier | Celo Sepolia | ZK passport verification / 零知识护照验证 |
| VerificationMirror | MegaETH | Celo verification mirror / Celo 验证镜像 |
| ContentAccessMirror | Base | Cross-chain content gating / 跨链内容门控 |

## Getting Started / 快速开始

### Prerequisites / 前置条件

- [Bun](https://bun.sh) (package manager & runtime / 包管理器和运行时)
- [Rust](https://rustup.rs) (for Tauri desktop build / 用于 Tauri 桌面应用构建)
- [Foundry](https://getfoundry.sh) (for smart contract development / 用于智能合约开发)

### Install / 安装

```bash
git clone https://github.com/user/dotheaven.git
cd dotheaven
bun install
```

### Development / 开发

```bash
bun dev              # Web dev server / 网页开发服务器
bun dev:tauri        # Tauri desktop app / Tauri 桌面应用
bun storybook        # Component Storybook / 组件 Storybook
bun check            # Type check all packages / 全项目类型检查
```

### Environment Variables / 环境变量

Create `apps/frontend/.env` — see `CLAUDE.md` for the full list.

创建 `apps/frontend/.env`——完整列表请参阅 `CLAUDE.md`。

```bash
VITE_CHAT_WORKER_URL=        # AI chat backend / AI 聊天后端
VITE_AGORA_APP_ID=           # Agora voice calls / Agora 语音通话
VITE_AA_GATEWAY_URL=         # Account abstraction gateway / 账户抽象网关
VITE_RESOLVER_URL=           # MusicBrainz resolver / MusicBrainz 解析器
VITE_SESSION_VOICE_URL=      # Voice rooms / 语音房间
VITE_LIT_SPONSORSHIP_API_URL= # Lit relayer / Lit 中继器
```

## Tooling / 工具链

| Tool / 工具 | Purpose / 用途 |
|---|---|
| [Bun](https://bun.sh) | Monorepo package manager, runtime, test runner / 单体仓库包管理器、运行时、测试 |
| [Vite](https://vite.dev) | Frontend build tool / 前端构建工具 |
| [SolidJS](https://solidjs.com) | Reactive UI framework / 响应式 UI 框架 |
| [Tailwind CSS v4](https://tailwindcss.com) | Styling / 样式 |
| [Storybook](https://storybook.js.org) | Component development and testing / 组件开发和测试 |
| [Tauri](https://tauri.app) | Desktop app shell (Rust) / 桌面应用外壳（Rust） |
| [Expo](https://expo.dev) | React Native build toolchain / React Native 构建工具链 |
| [Foundry](https://getfoundry.sh) | Smart contract development (Solidity) / 智能合约开发（Solidity） |
| [Goldsky](https://goldsky.com) | Subgraph indexing / 子图索引 |
| [Cloudflare Workers](https://workers.cloudflare.com) | Edge API services / 边缘 API 服务 |

## Directory READMEs / 子目录文档

Each major directory has its own README with detailed documentation.

每个主要目录都有自己的 README，提供详细文档。

| Directory / 目录 | Description / 描述 |
|---|---|
| [`services/heaven-resolver/`](services/heaven-resolver/README.md) | MusicBrainz proxy + IPFS image rehosting |
| [`services/lit-relayer/`](services/lit-relayer/README.md) | PKP minting relayer |
| [`services/alto/`](services/alto/README.md) | ERC-4337 bundler |
