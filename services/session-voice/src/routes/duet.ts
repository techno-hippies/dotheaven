/**
 * Duet Routes — paid duet control plane (x402-ready).
 *
 * Endpoints:
 * - POST /create
 * - GET  /discover
 * - POST /:id/guest/accept
 * - POST /:id/start
 * - POST /:id/segments/start
 * - POST /:id/bridge/token
 * - POST /:id/enter
 * - GET  /:id/public-info
 * - POST /:id/public-enter
 * - GET  /:id/watch
 * - GET  /:id/broadcast
 * - POST /:id/broadcast/heartbeat
 * - POST /:id/end
 * - POST /:id/recording/complete
 * - GET  /:id/replay
 * - GET  /:id/replay/source?token=...
 */

import { Hono } from 'hono'
import type { Env } from '../types'
import { verifyJWT } from '../auth'

type NetworkId = 'eip155:8453' | 'eip155:84532'
type ReplayMode = 'load_gated' | 'worker_gated'
type RecordingMode = 'host_local' | 'agora_cloud'
type RoomVisibility = 'public' | 'unlisted'
type RoomStatus = 'created' | 'live' | 'ended'

interface DuetDiscoverIndexRow {
  room_id: string
  host_wallet: string
  guest_wallet: string | null
  status: RoomStatus
  live_amount: string
  replay_amount: string
  audience_mode: 'free' | 'ticketed'
  visibility: RoomVisibility
  title: string | null
  room_kind: string | null
  listener_count: number
  live_started_at: number | null
  ended_at: number | null
  created_at: number
  updated_at: number
}

interface DuetDiscoverUpsertRow {
  room_id: string
  host_wallet: string
  guest_wallet: string | null
  status: RoomStatus
  split_address: string
  network: NetworkId
  live_amount: string
  replay_amount: string
  audience_mode: 'free' | 'ticketed'
  visibility: RoomVisibility
  title: string | null
  room_kind: string | null
  listener_count: number
  live_started_at: number | null
  ended_at: number | null
  created_at: number
  updated_at: number
}

const DEFAULT_NETWORK: NetworkId = 'eip155:84532'
const DEFAULT_ACCESS_WINDOW_MINUTES = 1440
const DEFAULT_LIVE_AMOUNT = '100000' // $0.10 USDC (6 decimals)
const DEFAULT_REPLAY_AMOUNT = '100000' // $0.10 USDC (6 decimals)
const BASE_MAINNET_USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'
const BASE_SEPOLIA_USDC = '0x036cbd53842c5426634e7929541ec2318f3dcf7e'

export const duetRoutes = new Hono<{ Bindings: Env }>()

duetRoutes.post('/create', async (c) => {
  const wallet = await requireWallet(c, c.env)
  if (!wallet) return c.json({ error: 'unauthorized' }, 401)

  const body = await c.req.json<{
    split_address?: string
    guest_wallet?: string
    network?: NetworkId
    asset_usdc?: string
    live_amount?: string | number
    replay_amount?: string | number
    access_window_minutes?: number
    replay_mode?: ReplayMode
    recording_mode?: RecordingMode
    visibility?: RoomVisibility
    title?: string
    room_kind?: string
  }>().catch(() => ({}))

  if (!body.split_address || !isAddress(body.split_address)) {
    return c.json({ error: 'invalid_split_address' }, 400)
  }
  if (body.guest_wallet && !isAddress(body.guest_wallet)) {
    return c.json({ error: 'invalid_guest_wallet' }, 400)
  }

  const network = body.network ?? DEFAULT_NETWORK
  if (!isNetworkId(network)) return c.json({ error: 'invalid_network' }, 400)
  if (network !== DEFAULT_NETWORK) {
    return c.json({ error: 'network_not_allowed', allowed: [DEFAULT_NETWORK] }, 400)
  }

  const assetUsdc = (body.asset_usdc ?? defaultUsdcForNetwork(network)).toLowerCase()
  if (!isAddress(assetUsdc)) return c.json({ error: 'invalid_asset_usdc' }, 400)
  if (assetUsdc !== defaultUsdcForNetwork(network).toLowerCase()) {
    return c.json({ error: 'asset_not_allowed', allowed: [defaultUsdcForNetwork(network).toLowerCase()] }, 400)
  }

  const liveAmount = parseUsdcAmountToBaseUnits(body.live_amount, DEFAULT_LIVE_AMOUNT)
  if (!liveAmount) return c.json({ error: 'invalid_live_amount' }, 400)

  const replayAmount = parseUsdcAmountToBaseUnits(body.replay_amount, DEFAULT_REPLAY_AMOUNT)
  if (!replayAmount) return c.json({ error: 'invalid_replay_amount' }, 400)

  const accessWindowMinutes = body.access_window_minutes ?? DEFAULT_ACCESS_WINDOW_MINUTES
  if (!Number.isFinite(accessWindowMinutes) || accessWindowMinutes <= 0) {
    return c.json({ error: 'invalid_access_window' }, 400)
  }

  const replayMode: ReplayMode = body.replay_mode ?? 'worker_gated'
  if (!isReplayMode(replayMode)) return c.json({ error: 'invalid_replay_mode' }, 400)

  const recordingMode: RecordingMode = body.recording_mode ?? 'host_local'
  if (!isRecordingMode(recordingMode)) return c.json({ error: 'invalid_recording_mode' }, 400)

  const visibility: RoomVisibility = body.visibility === 'unlisted' ? 'unlisted' : 'public'
  const title = normalizeRoomTitle(body.title)
  const roomKind = normalizeRoomKind(body.room_kind)

  const roomId = crypto.randomUUID()
  const agoraChannel = `heaven-duet-${roomId}`

  const stub = getDuetRoomStub(c.env, roomId)
  const doResp = await stub.fetch(new Request('http://do/init', {
    method: 'POST',
    body: JSON.stringify({
      roomId,
      hostWallet: wallet,
      guestWallet: body.guest_wallet?.toLowerCase(),
      splitAddress: body.split_address.toLowerCase(),
      network,
      assetUsdc,
      liveAmount,
      replayAmount,
      accessWindowMinutes: Math.floor(accessWindowMinutes),
      replayMode,
      recordingMode,
      agoraChannel,
    }),
  }))

  const forwarded = await forwardDoResponse(doResp)
  if (!forwarded.ok) return forwarded

  const payload = await forwarded.clone().json<any>().catch(() => null)
  const persistedRoomId = typeof payload?.room_id === 'string' ? payload.room_id : roomId
  const now = nowEpochSeconds()

  await upsertDuetDiscoveryRow(c.env, {
    room_id: persistedRoomId,
    host_wallet: wallet.toLowerCase(),
    guest_wallet: body.guest_wallet?.toLowerCase() || null,
    status: 'created',
    split_address: body.split_address.toLowerCase(),
    network,
    live_amount: liveAmount,
    replay_amount: replayAmount,
    audience_mode: liveAmount === '0' ? 'free' : 'ticketed',
    visibility,
    title,
    room_kind: roomKind,
    listener_count: 0,
    live_started_at: null,
    ended_at: null,
    created_at: now,
    updated_at: now,
  })

  return forwarded
})

duetRoutes.post('/:id/guest/accept', async (c) => {
  const wallet = await requireWallet(c, c.env)
  if (!wallet) return c.json({ error: 'unauthorized' }, 401)

  const roomId = c.req.param('id')
  const stub = getDuetRoomStub(c.env, roomId)
  const doResp = await stub.fetch(new Request('http://do/guest-accept', {
    method: 'POST',
    body: JSON.stringify({ wallet }),
  }))

  const forwarded = await forwardDoResponse(doResp)
  if (forwarded.ok) {
    const payload = await forwarded.clone().json<any>().catch(() => null)
    const guestWallet = typeof payload?.guest_wallet === 'string'
      ? payload.guest_wallet.toLowerCase()
      : wallet.toLowerCase()
    await updateDuetDiscoveryGuest(c.env, roomId, guestWallet)
  }
  return forwarded
})

duetRoutes.post('/:id/start', async (c) => {
  const wallet = await requireWallet(c, c.env)
  if (!wallet) return c.json({ error: 'unauthorized' }, 401)

  const roomId = c.req.param('id')
  const stub = getDuetRoomStub(c.env, roomId)
  const doResp = await stub.fetch(new Request('http://do/start', {
    method: 'POST',
    body: JSON.stringify({ wallet }),
  }))

  const forwarded = await forwardDoResponse(doResp)
  if (forwarded.ok) {
    const payload = await forwarded.clone().json<any>().catch(() => null)
    const status: RoomStatus = payload?.status === 'ended' ? 'ended' : 'live'
    const liveStartedAt = asOptionalEpoch(payload?.live_started_at) ?? nowEpochSeconds()
    await updateDuetDiscoveryStatus(c.env, roomId, status, liveStartedAt, null)
  }
  return forwarded
})

duetRoutes.get('/discover', async (c) => {
  const wallet = (await resolveOptionalWallet(c.req.header('authorization'), c.env))?.toLowerCase()
  const discoverWallet = wallet ?? ''
  const discoveryDb = getDiscoveryDb(c.env)
  if (!discoveryDb) {
    return c.json({ rooms: [] })
  }
  let rows:
    | D1Result<DuetDiscoverIndexRow>
    | null = null
  try {
    rows = await discoveryDb.prepare(
      `SELECT
         room_id,
         host_wallet,
         guest_wallet,
         status,
         live_amount,
         replay_amount,
         audience_mode,
         visibility,
         title,
         room_kind,
         listener_count,
         live_started_at,
         ended_at,
         created_at,
         updated_at
       FROM duet_rooms
       WHERE status IN ('created', 'live')
         AND (
           visibility = 'public'
           OR host_wallet = ?
           OR guest_wallet = ?
         )
       ORDER BY
         CASE status WHEN 'live' THEN 0 ELSE 1 END,
         COALESCE(live_started_at, created_at) DESC
       LIMIT 100`,
    )
      .bind(discoverWallet, discoverWallet)
      .all<DuetDiscoverIndexRow>()
  } catch (err) {
    // Backward compatibility for deployments that have not applied migration 0003 yet.
    console.warn('[duet/discover] query failed (returning empty list):', String(err))
    return c.json({ rooms: [] })
  }

  const rooms = (rows?.results ?? []).map((row) => {
    const createdAt = asOptionalEpoch(row.created_at) ?? nowEpochSeconds()
    const liveStartedAt = asOptionalEpoch(row.live_started_at)
    const updatedAt = asOptionalEpoch(row.updated_at) ?? createdAt
    return {
      room_id: row.room_id,
      host_wallet: row.host_wallet,
      guest_wallet: row.guest_wallet ?? null,
      status: row.status,
      title: row.title ?? null,
      room_kind: row.room_kind ?? null,
      live_amount: row.live_amount,
      replay_amount: row.replay_amount,
      audience_mode: row.audience_mode,
      listener_count: toNonNegativeInt(row.listener_count),
      live_started_at: liveStartedAt,
      started_at: liveStartedAt ?? createdAt,
      created_at: createdAt,
      updated_at: updatedAt,
    }
  })

  return c.json({ rooms })
})

  duetRoutes.post('/:id/segments/start', async (c) => {
    const wallet = await requireWallet(c, c.env)
    if (!wallet) return c.json({ error: 'unauthorized' }, 401)

    const roomId = c.req.param('id')
    const body = await c.req.json<{
      pay_to?: string
      song_id?: string
      rights?: unknown
    }>().catch(() => ({}))

    if (!body.pay_to || !isAddress(body.pay_to)) {
      return c.json({ error: 'invalid_pay_to' }, 400)
    }

    const stub = getDuetRoomStub(c.env, roomId)
    const doResp = await stub.fetch(new Request('http://do/segments/start', {
      method: 'POST',
      body: JSON.stringify({
        wallet,
        payTo: body.pay_to.toLowerCase(),
        songId: typeof body.song_id === 'string' ? body.song_id : undefined,
        rights: body.rights,
      }),
    }))

    return forwardDoResponse(doResp)
  })

  duetRoutes.post('/:id/bridge/token', async (c) => {
    const bridgeTicket = getBearerToken(c.req.header('authorization'))
    if (!bridgeTicket) return c.json({ error: 'bridge_ticket_required' }, 401)

  const roomId = c.req.param('id')
  const stub = getDuetRoomStub(c.env, roomId)
  const doResp = await stub.fetch(new Request('http://do/bridge-token', {
    method: 'POST',
    body: JSON.stringify({ bridgeTicket }),
  }))

  return forwardDoResponse(doResp)
})

duetRoutes.post('/:id/enter', async (c) => {
  const wallet = await requireWallet(c, c.env)
  if (!wallet) return c.json({ error: 'unauthorized' }, 401)

  const roomId = c.req.param('id')
  const paymentSignature = c.req.header('payment-signature') || undefined
  const stub = getDuetRoomStub(c.env, roomId)
  const doResp = await stub.fetch(new Request('http://do/enter', {
    method: 'POST',
    body: JSON.stringify({
      wallet,
      paymentSignature,
      resource: `/duet/${roomId}/enter`,
    }),
  }))

  const forwarded = await forwardDoResponse(doResp)
  if (forwarded.ok) {
    const payload = await forwarded.clone().json<any>().catch(() => null)
    if (typeof payload?.agora_viewer_token === 'string') {
      await incrementDuetDiscoveryListenerCount(c.env, roomId)
    }
  }
  return forwarded
})

duetRoutes.get('/:id/public-info', async (c) => {
  const roomId = c.req.param('id')
  const stub = getDuetRoomStub(c.env, roomId)
  const doResp = await stub.fetch(new Request('http://do/public-info'))
  return forwardDoResponse(doResp)
})

duetRoutes.post('/:id/public-enter', async (c) => {
  const roomId = c.req.param('id')
  const paymentSignature = c.req.header('payment-signature') || undefined
  const body = await c.req.json<{ wallet?: string; resource?: string }>()
    .catch(() => ({} as { wallet?: string; resource?: string }))
  const stub = getDuetRoomStub(c.env, roomId)
  const doResp = await stub.fetch(new Request('http://do/public-enter', {
    method: 'POST',
    body: JSON.stringify({
      wallet: body.wallet,
      paymentSignature,
      resource: body.resource || `/duet/${roomId}/public-enter`,
    }),
  }))
  const forwarded = await forwardDoResponse(doResp)
  if (forwarded.ok) {
    const payload = await forwarded.clone().json<any>().catch(() => null)
    if (typeof payload?.agora_viewer_token === 'string') {
      await incrementDuetDiscoveryListenerCount(c.env, roomId)
    }
  }
  return forwarded
})

duetRoutes.get('/:id/watch', async (c) => {
  const roomId = c.req.param('id')
  const escapedRoomId = roomId.replace(/[^a-zA-Z0-9-]/g, '')

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Heaven Duet Watch</title>
  <style>
    :root { color-scheme: dark; }
    body { margin:0; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif; background:#0f1116; color:#e7eaf2; }
    .wrap { max-width: 900px; margin: 0 auto; padding: 28px 18px 40px; }
    .card { background:#151925; border:1px solid #23283a; border-radius:14px; padding:16px; }
    .row { display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
    .muted { color:#9aa3ba; font-size:14px; }
    .btn { border:0; border-radius:999px; padding:10px 16px; font-weight:600; cursor:pointer; background:#8db3ff; color:#111521; }
    .btn[disabled] { opacity:.55; cursor:not-allowed; }
    #remote { margin-top:16px; min-height:120px; border:1px dashed #30364a; border-radius:10px; padding:8px; }
    .warn { color:#ffb870; }
    .err { color:#ff8d8d; white-space:pre-wrap; }
  </style>
  <script>
    // Load Agora Web SDK with a fallback CDN for more reliable local/dev runs.
    // If neither loads, AgoraRTC will remain undefined and the UI will show an error.
    window.__heavenAgoraLoaded = false;
    window.__heavenAgoraLoadError = null;
    function __heavenLoadAgoraFallback() {
      var s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/agora-rtc-sdk-ng@4.24.2/AgoraRTC_N.js';
      s.onload = function () { window.__heavenAgoraLoaded = true; };
      s.onerror = function () { window.__heavenAgoraLoadError = 'Agora Web SDK failed to load (primary + fallback).'; };
      document.head.appendChild(s);
    }
  </script>
  <script
    src="https://download.agora.io/sdk/release/AgoraRTC_N.js"
    onload="window.__heavenAgoraLoaded = true;"
    onerror="window.__heavenAgoraLoadError = 'Agora Web SDK primary CDN failed; trying fallback...'; __heavenLoadAgoraFallback();"
  ></script>
</head>
<body>
  <div class="wrap">
    <h1>Heaven Duet Live</h1>
    <div class="card">
      <div class="row">
        <strong>Room:</strong> <span>${escapedRoomId}</span>
      </div>
      <div class="row muted" id="statusRow">Loading room status...</div>
      <div class="row" style="margin-top:10px;">
        <button class="btn" id="connectBtn" style="display:none;">Connect Wallet</button>
        <button class="btn" id="enterBtn">Enter Live</button>
      </div>
      <div class="row muted" id="walletRow" style="margin-top:10px; display:none;"></div>
      <div id="message" class="muted" style="margin-top:10px;"></div>
      <div id="error" class="err" style="margin-top:10px;"></div>
    </div>
    <div id="remote"></div>
  </div>
  <script>
    const roomId = ${JSON.stringify(escapedRoomId)};
    const statusRow = document.getElementById('statusRow');
    const connectBtn = document.getElementById('connectBtn');
    const enterBtn = document.getElementById('enterBtn');
    const walletRow = document.getElementById('walletRow');
    const message = document.getElementById('message');
    const error = document.getElementById('error');
    const remote = document.getElementById('remote');
    const facilitatorMode = ${JSON.stringify(c.env.X402_FACILITATOR_MODE || 'mock')};
    const BASE_SEPOLIA_CHAIN_ID = 84532;
    const BASE_SEPOLIA_CHAIN_ID_HEX = '0x14a34';
    const JWT_KEY_PREFIX = 'heaven_duet_watch_jwt_';
    let client;
    let tokenRenewTimer = null;
    let renewInFlight = false;
    let connectedWallet = null;
    let authToken = null;
    let lastInfo = null;
    const connectedAudioUsers = new Set();
    const walletKey = 'heaven_duet_watch_wallet';

    function setError(text) { error.textContent = text || ''; }
    function setMessage(text, warning=false) {
      message.textContent = text || '';
      message.className = warning ? 'warn' : 'muted';
    }
    function setWalletStatus(text) {
      if (!walletRow) return;
      walletRow.textContent = text || '';
      walletRow.style.display = text ? 'flex' : 'none';
    }
    function shortAddr(addr) {
      if (!addr || typeof addr !== 'string') return '';
      return addr.slice(0, 6) + '...' + addr.slice(-4);
    }
    function hasEip1193() {
      return typeof window !== 'undefined' && window.ethereum && typeof window.ethereum.request === 'function';
    }
    function decodePaymentRequired(raw) {
      if (!raw) return null;
      try {
        return JSON.parse(atob(raw));
      } catch {
        return null;
      }
    }
    function decodeJwtPayload(token) {
      try {
        const parts = String(token || '').split('.');
        if (parts.length !== 3) return null;
        const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const pad = b64.length % 4;
        const padded = b64 + (pad ? '='.repeat(4 - pad) : '');
        return JSON.parse(atob(padded));
      } catch {
        return null;
      }
    }
    function safeBase64Encode(data) {
      const bytes = new TextEncoder().encode(data);
      let binaryString = '';
      for (const b of bytes) binaryString += String.fromCharCode(b);
      return btoa(binaryString);
    }
    function randomBytesHex32() {
      const bytes = new Uint8Array(32);
      crypto.getRandomValues(bytes);
      return '0x' + Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
    }

    function randomWallet() {
      const bytes = new Uint8Array(20);
      crypto.getRandomValues(bytes);
      return '0x' + Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
    }
    function getViewerWallet() {
      const existing = localStorage.getItem(walletKey);
      if (existing && /^0x[a-fA-F0-9]{40}$/.test(existing)) return existing.toLowerCase();
      const next = randomWallet().toLowerCase();
      localStorage.setItem(walletKey, next);
      return next;
    }
    function buildMockPaymentSignature(requiredPayload, wallet) {
      const accepts = Array.isArray(requiredPayload?.accepts) ? requiredPayload.accepts : [];
      const accepted = accepts[0];
      if (!accepted || typeof accepted !== 'object') return null;
      const payload = {
        network: accepted.network,
        asset: accepted.asset,
        amount: accepted.amount,
        payTo: accepted.payTo,
        wallet,
        resource: requiredPayload?.resource || '/duet/' + roomId + '/public-enter',
      };
      if (requiredPayload?.extensions) payload.extensions = requiredPayload.extensions;
      return btoa(JSON.stringify(payload));
    }
    async function requestPublicEnter(paymentSignature, wallet) {
      const headers = { 'content-type': 'application/json' };
      if (paymentSignature) headers['PAYMENT-SIGNATURE'] = paymentSignature;
      const body = wallet ? { wallet } : {};
      return fetch('/duet/' + roomId + '/public-enter', {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
    }
    async function requestEnter(paymentSignature) {
      const headers = {};
      if (authToken) headers.Authorization = 'Bearer ' + authToken;
      if (paymentSignature) headers['PAYMENT-SIGNATURE'] = paymentSignature;
      return fetch('/duet/' + roomId + '/enter', { method: 'POST', headers });
    }
    async function ensureBaseSepolia() {
      if (!hasEip1193()) throw new Error('No wallet found. Install a Base Sepolia-compatible wallet (eg MetaMask).');
      const chainId = await window.ethereum.request({ method: 'eth_chainId' });
      if (chainId === BASE_SEPOLIA_CHAIN_ID_HEX) return;

      try {
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: BASE_SEPOLIA_CHAIN_ID_HEX }],
        });
      } catch (e) {
        // MetaMask: 4902 = unknown chain.
        if (e && typeof e === 'object' && e.code === 4902) {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: BASE_SEPOLIA_CHAIN_ID_HEX,
              chainName: 'Base Sepolia',
              rpcUrls: ['https://base-sepolia-rpc.publicnode.com/'],
              nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
              blockExplorerUrls: ['https://sepolia.basescan.org'],
            }],
          });
          return;
        }
        throw e;
      }
    }
    async function connectWallet() {
      if (!hasEip1193()) throw new Error('No wallet found. Install a Base Sepolia-compatible wallet (eg MetaMask).');
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      const acct = Array.isArray(accounts) ? accounts[0] : null;
      if (!acct || typeof acct !== 'string') throw new Error('Wallet connection failed (no accounts returned).');
      connectedWallet = acct.toLowerCase();
      // Some providers are picky about checksum casing when selecting the account to sign with.
      // Keep the original address for wallet RPC calls, but always send lowercase to our backend.
      window.__heavenConnectedWalletRaw = acct;
      setWalletStatus('Wallet: ' + shortAddr(connectedWallet) + ' (Base Sepolia)');
      return connectedWallet;
    }
    function readStoredJwt(wallet) {
      const key = JWT_KEY_PREFIX + wallet.toLowerCase();
      const token = localStorage.getItem(key);
      if (!token) return null;
      const payload = decodeJwtPayload(token);
      const exp = payload && typeof payload.exp === 'number' ? payload.exp : null;
      if (!exp) return null;
      const now = Math.floor(Date.now() / 1000);
      if (exp <= now + 10) return null;
      return token;
    }
    function storeJwt(wallet, token) {
      const key = JWT_KEY_PREFIX + wallet.toLowerCase();
      localStorage.setItem(key, token);
    }
    async function ensureJwt() {
      if (!connectedWallet) await connectWallet();
      const existing = readStoredJwt(connectedWallet);
      if (existing) {
        authToken = existing;
        return authToken;
      }

      setMessage('Sign in: requesting nonce...');
      const nonceRes = await fetch('/auth/nonce', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ wallet: connectedWallet }),
      });
      const nonceBody = await nonceRes.json().catch(() => ({}));
      if (!nonceRes.ok) throw new Error(nonceBody.error || ('HTTP ' + nonceRes.status));
      if (!nonceBody.nonce) throw new Error('Auth nonce missing from server response.');

      setMessage('Sign in: please sign the nonce in your wallet...');
      const walletRaw = (window.__heavenConnectedWalletRaw && typeof window.__heavenConnectedWalletRaw === 'string')
        ? window.__heavenConnectedWalletRaw
        : connectedWallet;

      async function signNoncePersonal(nonce, wallet, reverseParams) {
        // Wallet providers disagree on personal_sign param ordering.
        // MetaMask: [message, address]. Some others: [address, message].
        const params = reverseParams ? [wallet, nonce] : [nonce, wallet];
        return await window.ethereum.request({ method: 'personal_sign', params });
      }

      let signature = null;
      try {
        signature = await signNoncePersonal(nonceBody.nonce, walletRaw, false);
      } catch (e) {
        // If the provider rejected the call, try the alternate order before failing.
        signature = await signNoncePersonal(nonceBody.nonce, walletRaw, true);
      }

      async function verifySig(sig) {
        const res = await fetch('/auth/verify', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ wallet: connectedWallet, signature: sig, nonce: nonceBody.nonce }),
        });
        const body = await res.json().catch(() => ({}));
        return { res, body };
      }

      let verifyRes = null;
      let verifyBody = null;
      ({ res: verifyRes, body: verifyBody } = await verifySig(signature));

      if (!verifyRes.ok && verifyBody && verifyBody.error === 'invalid signature') {
        // If we got a signature but the backend can't verify it, retry with reversed param ordering.
        // The nonce is not consumed on invalid signatures, so this is safe.
        setMessage('Sign in: signature mismatch; retrying...');
        const altSig = await signNoncePersonal(nonceBody.nonce, walletRaw, true);
        ({ res: verifyRes, body: verifyBody } = await verifySig(altSig));
        signature = altSig;
      }

      if (!verifyRes.ok) throw new Error(verifyBody.error || ('HTTP ' + verifyRes.status));
      if (!verifyBody.token) throw new Error('Auth token missing from server response.');

      authToken = verifyBody.token;
      storeJwt(connectedWallet, authToken);
      return authToken;
    }
    async function createExactEip3009PaymentSignature(paymentRequired, wallet) {
      const accepts = Array.isArray(paymentRequired?.accepts) ? paymentRequired.accepts : [];
      const accepted = accepts[0];
      if (!accepted || typeof accepted !== 'object') throw new Error('Invalid PAYMENT-REQUIRED payload.');
      if (accepted.scheme !== 'exact') throw new Error('Unsupported payment scheme: ' + String(accepted.scheme));
      if (accepted.network !== 'eip155:84532') throw new Error('Payments are locked to Base Sepolia (eip155:84532).');

      const now = Math.floor(Date.now() / 1000);
      const maxTimeoutSeconds = typeof accepted.maxTimeoutSeconds === 'number' ? accepted.maxTimeoutSeconds : 3600;
      const eip712Name = accepted.extra && typeof accepted.extra === 'object' && accepted.extra.name ? accepted.extra.name : 'USDC';
      const eip712Version = accepted.extra && typeof accepted.extra === 'object' && accepted.extra.version ? accepted.extra.version : '2';

      const authorization = {
        from: wallet,
        to: accepted.payTo,
        value: accepted.amount,
        validAfter: String(now - 600),
        validBefore: String(now + maxTimeoutSeconds),
        nonce: randomBytesHex32(),
      };

      const typedData = {
        types: {
          EIP712Domain: [
            { name: 'name', type: 'string' },
            { name: 'version', type: 'string' },
            { name: 'chainId', type: 'uint256' },
            { name: 'verifyingContract', type: 'address' },
          ],
          TransferWithAuthorization: [
            { name: 'from', type: 'address' },
            { name: 'to', type: 'address' },
            { name: 'value', type: 'uint256' },
            { name: 'validAfter', type: 'uint256' },
            { name: 'validBefore', type: 'uint256' },
            { name: 'nonce', type: 'bytes32' },
          ],
        },
        primaryType: 'TransferWithAuthorization',
        domain: {
          name: eip712Name,
          version: eip712Version,
          chainId: BASE_SEPOLIA_CHAIN_ID,
          verifyingContract: accepted.asset,
        },
        message: authorization,
      };

      const signature = await window.ethereum.request({
        method: 'eth_signTypedData_v4',
        params: [wallet, JSON.stringify(typedData)],
      });

      const paymentPayload = {
        x402Version: 2,
        resource: paymentRequired.resource,
        accepted,
        payload: { authorization, signature },
        ...(paymentRequired.extensions ? { extensions: paymentRequired.extensions } : {}),
      };

      return safeBase64Encode(JSON.stringify(paymentPayload));
    }
    function updateAudioMessage() {
      if (connectedAudioUsers.size > 0) {
        setMessage('Live audio connected.');
      } else {
        setMessage('Connected. Waiting for host audio...');
      }
    }

    async function refreshInfo() {
      try {
        const res = await fetch('/duet/' + roomId + '/public-info');
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || ('HTTP ' + res.status));
        const liveBroadcast = body.status === 'live'
          ? (body.broadcaster_online ? 'On Air' : 'Waiting on host')
          : 'Offline';
        statusRow.textContent = 'Status: ' + body.status + ' | Audience: ' + body.audience_mode + ' | Broadcast: ' + liveBroadcast;
        lastInfo = body;
        enterBtn.disabled = !body.can_enter;
        if (connectBtn) {
          const shouldShowConnect = hasEip1193() && facilitatorMode !== 'mock' && body.audience_mode === 'ticketed';
          connectBtn.style.display = shouldShowConnect ? 'inline-block' : 'none';
        }
      } catch (e) {
        statusRow.textContent = 'Failed to load room status';
        setError(String(e));
      }
    }

    function stopTokenRenewal() {
      if (tokenRenewTimer) clearInterval(tokenRenewTimer);
      tokenRenewTimer = null;
    }

    async function renewAgoraToken() {
      if (!client) return;
      if (renewInFlight) return;
      renewInFlight = true;
      try {
        // For free rooms: just call public-enter.
        if (lastInfo && lastInfo.audience_mode === 'free') {
          const res = await requestPublicEnter(undefined, undefined);
          if (!res.ok) return;
          const body = await res.json().catch(() => null);
          if (body && body.agora_viewer_token && typeof client.renewToken === 'function') {
            await client.renewToken(body.agora_viewer_token);
          }
          return;
        }

        if (facilitatorMode === 'mock') {
          const wallet = getViewerWallet();
          const res = await requestPublicEnter(undefined, wallet);
          if (!res.ok) return;
          const body = await res.json().catch(() => null);
          if (body && body.agora_viewer_token && typeof client.renewToken === 'function') {
            await client.renewToken(body.agora_viewer_token);
          }
          return;
        }

        // Real mode: renew via authenticated /enter while entitlement is valid.
        try {
          await ensureJwt();
        } catch {
          // If user cancels a re-auth prompt, don't hard-fail.
          return;
        }

        const res = await requestEnter(undefined);
        if (res.status === 401) {
          authToken = null;
          return;
        }
        if (res.status === 402) {
          stopTokenRenewal();
          setMessage('Access expired. Please re-enter and complete payment again.', true);
          return;
        }
        if (!res.ok) return;

        const body = await res.json().catch(() => null);
        if (body && body.agora_viewer_token && typeof client.renewToken === 'function') {
          await client.renewToken(body.agora_viewer_token);
        }
      } finally {
        renewInFlight = false;
      }
    }

    function startTokenRenewal() {
      stopTokenRenewal();
      // Agora viewer tokens are 90s TTL; renew every ~45s.
      tokenRenewTimer = setInterval(renewAgoraToken, 45000);
    }

    async function enterLive() {
      setError('');
      setMessage('Requesting access...');
      enterBtn.disabled = true;
      try {
        connectedAudioUsers.clear();
        if (client) {
          try { await client.leave(); } catch (_) {}
          client = null;
        }
        stopTokenRenewal();

        // Free rooms never need wallet/payment; just use public-enter.
        if (lastInfo && lastInfo.audience_mode === 'free') {
          const res = await requestPublicEnter(undefined, undefined);
          const body = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(body.error || ('HTTP ' + res.status));
          await joinAgora(body);
          return;
        }

        if (facilitatorMode === 'mock') {
          const viewerWallet = getViewerWallet();
          const res = await requestPublicEnter(undefined, viewerWallet);

          if (res.status === 402) {
            const required = res.headers.get('PAYMENT-REQUIRED');
            const paymentRequiredPayload = decodePaymentRequired(required);
            if (paymentRequiredPayload) {
              const signature = buildMockPaymentSignature(paymentRequiredPayload, viewerWallet);
              if (signature) {
                setMessage('Ticketed room detected. Completing mock x402 payment...', true);
                const paid = await requestPublicEnter(signature, viewerWallet);
                if (paid.status === 402) {
                  setMessage('Payment required. Mock settlement did not pass; verify room payment terms.', true);
                  return;
                }
                if (!paid.ok) {
                  const paidBody = await paid.json().catch(() => ({}));
                  throw new Error(paidBody.error || ('HTTP ' + paid.status));
                }
                const paidBody = await paid.json();
                await joinAgora(paidBody);
                return;
              }
            }
            setMessage('Payment required but mock signature could not be created.', true);
            return;
          }

          const body = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(body.error || ('HTTP ' + res.status));
          await joinAgora(body);
          return;
        }

        // Real mode: wallet + JWT + on-chain x402 payment.
        if (!hasEip1193()) {
          setMessage('This room is ticketed. Install a wallet to pay (Base Sepolia only).', true);
          return;
        }

        if (!connectedWallet) {
          await connectWallet();
        }
        await ensureBaseSepolia();
        await ensureJwt();

        let res = await requestEnter(undefined);
        if (res.status === 401) {
          authToken = null;
          await ensureJwt();
          res = await requestEnter(undefined);
        }

        if (res.status === 402) {
          const required = res.headers.get('PAYMENT-REQUIRED');
          const paymentRequiredPayload = decodePaymentRequired(required);
          if (!paymentRequiredPayload) throw new Error('PAYMENT-REQUIRED header missing/invalid.');
          setMessage('Payment required. Please sign the USDC authorization in your wallet...', true);
          const paymentSignature = await createExactEip3009PaymentSignature(paymentRequiredPayload, connectedWallet);
          const paid = await requestEnter(paymentSignature);
          if (paid.status === 402) {
            const body = await paid.json().catch(() => ({}));
            setMessage('Payment failed: ' + String(body.error || 'unknown_error'), true);
            return;
          }
          const paidBody = await paid.json().catch(() => ({}));
          if (!paid.ok) throw new Error(paidBody.error || ('HTTP ' + paid.status));
          await joinAgora(paidBody);
          return;
        }

        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || ('HTTP ' + res.status));
        await joinAgora(body);
      } catch (e) {
        setError(String(e));
        connectedAudioUsers.clear();
        setMessage('');
      } finally {
        enterBtn.disabled = false;
      }
    }

    async function joinAgora(body) {
      setMessage('Joining live audio...');
      client = AgoraRTC.createClient({ mode: 'live', codec: 'vp8' });
      await client.setClientRole('audience');
      client.on('token-privilege-will-expire', () => { renewAgoraToken(); });
      client.on('token-privilege-did-expire', () => { renewAgoraToken(); });
      client.on('user-published', async (user, mediaType) => {
        await client.subscribe(user, mediaType);
        if (mediaType === 'audio') {
          user.audioTrack.play();
          connectedAudioUsers.add(String(user.uid));
          updateAudioMessage();
        }
        if (mediaType === 'video') {
          const el = document.createElement('div');
          el.id = 'u-' + user.uid;
          el.style.width = '100%';
          el.style.maxWidth = '860px';
          el.style.aspectRatio = '16/9';
          el.style.background = '#090c13';
          el.style.borderRadius = '10px';
          if (!document.getElementById(el.id)) remote.appendChild(el);
          user.videoTrack.play(el.id);
        }
      });

      client.on('user-unpublished', (user, mediaType) => {
        if (mediaType === 'audio') {
          connectedAudioUsers.delete(String(user.uid));
          updateAudioMessage();
        }
        if (mediaType === 'video') {
          const el = document.getElementById('u-' + user.uid);
          if (el) el.remove();
        }
      });
      client.on('user-left', (user) => {
        connectedAudioUsers.delete(String(user.uid));
        updateAudioMessage();
        const el = document.getElementById('u-' + user.uid);
        if (el) el.remove();
      });

      await client.join(
        body.agora_app_id,
        body.agora_channel,
        body.agora_viewer_token,
        body.agora_uid,
      );
      updateAudioMessage();
      startTokenRenewal();
    }

    enterBtn.addEventListener('click', enterLive);
    if (connectBtn) {
      connectBtn.addEventListener('click', async () => {
        setError('');
        try {
          await connectWallet();
          await ensureBaseSepolia();
          await ensureJwt();
          setMessage('Wallet connected.');
        } catch (e) {
          setError(String(e));
        }
      });
    }

    if (hasEip1193()) {
      try {
        window.ethereum.on('accountsChanged', (accounts) => {
          const acct = Array.isArray(accounts) ? accounts[0] : null;
          connectedWallet = acct ? String(acct).toLowerCase() : null;
          authToken = null;
          if (connectedWallet) {
            setWalletStatus('Wallet: ' + shortAddr(connectedWallet) + ' (Base Sepolia)');
          } else {
            setWalletStatus('');
          }
        });
        window.ethereum.on('chainChanged', () => {
          // Let enter flow handle switches; don't auto-switch on every chain change.
        });
      } catch (_) {}
    }

    refreshInfo();
    setInterval(refreshInfo, 5000);
  </script>
</body>
</html>`

  return c.html(html)
})

duetRoutes.get('/:id/broadcast', async (c) => {
  const roomId = c.req.param('id')
  const escapedRoomId = roomId.replace(/[^a-zA-Z0-9-]/g, '')
  const bridgeTicket = c.req.query('bridgeTicket') || ''
  const hasBridgeTicket = bridgeTicket.length > 0
  const appId = c.env.AGORA_APP_ID || ''
  const appConfigured = appId.length > 0

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Heaven Duet Host Broadcast</title>
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      background: radial-gradient(1200px 600px at 10% -20%, #212947 0%, #0d1119 45%, #090c12 100%);
      color: #e7eaf2;
      min-height: 100vh;
    }
    .wrap {
      max-width: 980px;
      margin: 0 auto;
      padding: 26px 16px 36px;
    }
    .topbar {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 14px;
    }
    h1 {
      margin: 0 0 6px;
      font-size: 28px;
      line-height: 1.15;
      font-weight: 700;
      letter-spacing: -0.02em;
    }
    .sub {
      margin: 0;
      color: #a9b2c8;
      font-size: 14px;
    }
    .pill {
      border-radius: 999px;
      border: 1px solid #2a3553;
      background: #182038;
      color: #c0d0ff;
      font-weight: 600;
      font-size: 12px;
      line-height: 1;
      padding: 8px 12px;
      white-space: nowrap;
      margin-top: 2px;
    }
    .pill.live {
      border-color: #1f5f3a;
      background: #123323;
      color: #91edbe;
    }
    .pill.idle {
      border-color: #3f475d;
      background: #222838;
      color: #bec5d7;
    }
    .pill.error {
      border-color: #7a2f38;
      background: #341821;
      color: #ffb1be;
    }
    .grid {
      display: grid;
      gap: 12px;
      grid-template-columns: 1.45fr 1fr;
    }
    @media (max-width: 820px) {
      .grid { grid-template-columns: 1fr; }
    }
    .card {
      background: rgba(19, 24, 36, 0.92);
      border: 1px solid #232b3e;
      border-radius: 14px;
      padding: 16px;
      box-shadow: 0 14px 48px rgba(5, 7, 12, 0.35);
    }
    .card h2, .card h3 {
      margin: 0 0 8px;
      font-size: 16px;
      font-weight: 650;
      color: #f1f4fd;
    }
    .muted {
      color: #9ea9c4;
      font-size: 14px;
      line-height: 1.5;
      margin: 0 0 12px;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-bottom: 12px;
    }
    .btn {
      border: 1px solid transparent;
      border-radius: 999px;
      padding: 10px 14px;
      font-weight: 600;
      cursor: pointer;
      transition: filter .15s ease, opacity .15s ease;
      background: #7fa8ff;
      color: #0f1524;
    }
    .btn:hover { filter: brightness(1.04); }
    .btn[disabled] { opacity: .55; cursor: not-allowed; filter: none; }
    .btn.alt {
      background: #1f2840;
      color: #c4d1f7;
      border-color: #2f3b5b;
    }
    .btn.good {
      background: #7ed0a0;
      color: #112117;
    }
    .btn.stop {
      background: #2a3043;
      border-color: #404c6b;
      color: #d3daee;
    }
    .btn.small {
      padding: 8px 12px;
      font-size: 12px;
    }
    .field {
      margin-bottom: 12px;
    }
    .label {
      display: block;
      margin: 0 0 6px;
      color: #c7d1ea;
      font-size: 13px;
      font-weight: 600;
    }
    .row-inline {
      display: flex;
      gap: 8px;
      align-items: center;
    }
    select {
      flex: 1;
      min-width: 0;
      border-radius: 10px;
      border: 1px solid #34405f;
      background: #11192a;
      color: #dce5ff;
      padding: 10px 11px;
      font-size: 13px;
      outline: none;
    }
    select:focus {
      border-color: #7ea8ff;
      box-shadow: 0 0 0 2px rgba(126,168,255,0.2);
    }
    .notice {
      border-radius: 10px;
      padding: 10px 12px;
      font-size: 14px;
      line-height: 1.45;
      border: 1px solid #2b3550;
      background: #171f34;
      color: #cbd5f2;
      min-height: 40px;
      display: flex;
      align-items: center;
    }
    .notice.warn {
      border-color: #604728;
      background: #2e2518;
      color: #ffcf98;
    }
    .notice.err {
      border-color: #70303c;
      background: #331a22;
      color: #ffb5c0;
      white-space: pre-wrap;
    }
    .diag {
      border-radius: 10px;
      border: 1px dashed #35415f;
      background: #111829;
      padding: 12px;
      color: #a9b7da;
      font-size: 13px;
      white-space: pre-wrap;
      line-height: 1.5;
      min-height: 120px;
    }
    .tiny {
      font-size: 12px;
      margin: 6px 0 0;
    }
  </style>
  <script>
    // Load Agora Web SDK with a fallback CDN for more reliable local/dev runs.
    // If neither loads, AgoraRTC will remain undefined and the UI will show an error.
    window.__heavenAgoraLoaded = false;
    window.__heavenAgoraLoadError = null;
    function __heavenLoadAgoraFallback() {
      var s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/agora-rtc-sdk-ng@4.24.2/AgoraRTC_N.js';
      s.onload = function () { window.__heavenAgoraLoaded = true; };
      s.onerror = function () { window.__heavenAgoraLoadError = 'Agora Web SDK failed to load (primary + fallback).'; };
      document.head.appendChild(s);
    }
  </script>
  <script
    src="https://download.agora.io/sdk/release/AgoraRTC_N.js"
    onload="window.__heavenAgoraLoaded = true;"
    onerror="window.__heavenAgoraLoadError = 'Agora Web SDK primary CDN failed; trying fallback...'; __heavenLoadAgoraFallback();"
  ></script>
</head>
<body>
  <div class="wrap">
    <div class="topbar">
	      <div>
	        <h1>Heaven Host Broadcast</h1>
	        <p class="sub">Room ${escapedRoomId}</p>
	      </div>
      <div class="pill" id="statePill">Ready</div>
    </div>
    <div class="grid">
	      <section class="card">
	        <h2>Broadcast Source</h2>
	        <p class="muted">Recommended: use <strong>Start App Audio Share</strong> to capture app/system audio. Use mic fallback only when needed.</p>
	        <div class="actions">
	          <button class="btn" id="shareBtn">Start App Audio Share</button>
	          <button class="btn alt" id="startBtn">Start Mic Broadcast</button>
          <button class="btn good" id="toneBtn">Start Test Tone</button>
          <button class="btn stop" id="stopBtn" disabled>Stop</button>
        </div>
        <div id="message" class="notice"></div>
        <div id="error" class="notice err" style="margin-top:10px;display:none;"></div>
      </section>
	      <aside class="card">
	        <div class="field">
	          <label class="label" for="micSelect">Mic source for “Start Mic Broadcast”</label>
          <div class="row-inline">
            <select id="micSelect"></select>
            <button class="btn alt small" id="refreshMicsBtn" type="button">Refresh</button>
          </div>
	          <p class="muted tiny" id="micHint">Choose your microphone source here.</p>
	        </div>
	        <h3>Detected devices</h3>
	        <div id="diag" class="diag">Loading microphone devices…</div>
      </aside>
    </div>
    <div class="card" style="margin-top:12px;">
      <p class="muted" style="margin:0;">If app audio capture has no audio track, choose <strong>Entire Screen</strong> and enable <strong>Share audio</strong> in the browser picker.</p>
    </div>
  </div>
  <script>
    const roomId = ${JSON.stringify(escapedRoomId)};
    const bridgeTicket = ${JSON.stringify(bridgeTicket)};
    const appId = ${JSON.stringify(appId)};
    const shareBtn = document.getElementById('shareBtn');
    const startBtn = document.getElementById('startBtn');
    const toneBtn = document.getElementById('toneBtn');
    const stopBtn = document.getElementById('stopBtn');
    const statePill = document.getElementById('statePill');
    const message = document.getElementById('message');
    const error = document.getElementById('error');
    const diag = document.getElementById('diag');
    const micSelect = document.getElementById('micSelect');
    const refreshMicsBtn = document.getElementById('refreshMicsBtn');
    const micHint = document.getElementById('micHint');
    const MIC_DEVICE_STORAGE_KEY = 'heaven_duet_mic_device_id';
    const HEARTBEAT_INTERVAL_MS = 5000;
    let client = null;
    let audioTrack = null;
    let broadcastMode = '';
    let heartbeatTimer = null;
    let toneContext = null;
    let toneOscillator = null;
    let sharedMediaStream = null;
    let selectedMicDeviceId = '';
    let selectedMicLabel = 'Default';
    let jacktripSourceDetected = false;

    function setState(label, variant = '') {
      statePill.textContent = label;
      statePill.className = 'pill' + (variant ? ' ' + variant : '');
    }
    function setError(text) {
      if (!text) {
        error.style.display = 'none';
        error.textContent = '';
        return;
      }
      error.style.display = 'flex';
      error.textContent = text;
      setState('Error', 'error');
    }
	    function setMessage(text, warning=false) {
	      message.textContent = text || '';
	      message.className = warning ? 'notice warn' : 'notice';
	    }
	    function errText(err) {
	      if (!err) return 'unknown_error';
	      if (typeof err === 'string') return err;
	      if (err.message) return String(err.message);
	      return String(err);
	    }
	    function safeStringify(value) {
	      try {
	        return JSON.stringify(value, null, 2);
	      } catch (_) {
	        try {
	          return JSON.stringify(String(value));
	        } catch (_) {
	          return String(value);
	        }
	      }
	    }
	    function errDetails(err) {
	      if (!err) return 'unknown_error';
	      if (typeof err === 'string') return err;

	      const out = [];
	      try {
	        const name = err && err.name ? String(err.name) : '';
	        const code = err && (err.code ?? err.errorCode) ? String(err.code ?? err.errorCode) : '';
	        const msg = err && err.message ? String(err.message) : '';
	        const desc = err && err.desc ? String(err.desc) : '';
	        const reason = err && err.reason ? String(err.reason) : '';

	        const headLeft = (name || 'Error') + (code ? ' (' + code + ')' : '');
	        const head = (headLeft + (msg ? ': ' + msg : '')).trim();
	        if (head) out.push(head);
	        if (desc && desc !== msg) out.push('desc: ' + desc);
	        if (reason) out.push('reason: ' + reason);

	        if (err && err.debug) {
	          out.push('debug: ' + safeStringify(err.debug));
	        }

	        if (err && err.stack) out.push(String(err.stack));

	        // Best-effort capture of extra fields on AgoraRTCError (and friends).
	        try {
	          const json = typeof err.toJSON === 'function' ? err.toJSON() : err;
	          const raw = JSON.parse(JSON.stringify(json));
	          if (raw && typeof raw === 'object') {
	            out.push('raw: ' + safeStringify(raw));
	          }
	        } catch (_) {}
	      } catch (_) {
	        out.push(errText(err));
	      }

	      return out.join('\\n');
	    }
	    function stopHeartbeatLoop() {
	      if (heartbeatTimer) {
	        clearInterval(heartbeatTimer);
	        heartbeatTimer = null;
	      }
    }
    async function sendHeartbeat(status = 'live', mode = broadcastMode) {
      if (!bridgeTicket) return;
      try {
        await fetch('/duet/' + roomId + '/broadcast/heartbeat', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'authorization': 'Bearer ' + bridgeTicket,
          },
          body: JSON.stringify({ status, mode }),
        });
      } catch (e) {
        console.warn('broadcast heartbeat failed', e);
      }
    }
    function startHeartbeatLoop() {
      stopHeartbeatLoop();
      heartbeatTimer = setInterval(() => {
        void sendHeartbeat('live', broadcastMode);
      }, HEARTBEAT_INTERVAL_MS);
    }
    function isDeviceError(err) {
      const text = errText(err).toLowerCase();
      return text.includes('device_not_found')
        || text.includes('notfounderror')
        || text.includes('requested device not found')
        || text.includes('notallowederror')
        || text.includes('permission denied');
    }

	    function findPreferredMicIndex(mics, savedDeviceId) {
	      const jacktripIdx = mics.findIndex((m) => {
	        const label = String(m.label || '').toLowerCase();
	        return label.includes('jacktrip')
	          || label.includes('monitor of jacktrip_duet')
	          || label.includes('remapped jacktrip_duet.monitor');
	      });

	      if (savedDeviceId) {
	        const savedIdx = mics.findIndex((m) => m.deviceId === savedDeviceId);
	        // Do not pin to generic "default" when a specific virtual source is available.
	        if (savedIdx >= 0 && !(savedDeviceId === 'default' && jacktripIdx >= 0)) {
	          return savedIdx;
	        }
	      }

      if (jacktripIdx >= 0) return jacktripIdx;
      return 0;
    }

	    function setSelectedMicFromSelect() {
	      const idx = micSelect.selectedIndex;
	      selectedMicDeviceId = micSelect.value || '';
	      selectedMicLabel = idx >= 0 ? (micSelect.options[idx].textContent || 'Default') : 'Default';
      if (selectedMicDeviceId) {
        localStorage.setItem(MIC_DEVICE_STORAGE_KEY, selectedMicDeviceId);
      } else {
        localStorage.removeItem(MIC_DEVICE_STORAGE_KEY);
      }
	      micHint.textContent = 'Selected source: ' + selectedMicLabel;
	    }

    async function writeDeviceDiagnostics() {
      try {
        const mics = await AgoraRTC.getMicrophones();
        if (!mics || mics.length === 0) {
          micSelect.innerHTML = '<option value="">No microphone devices found</option>';
          micSelect.disabled = true;
          selectedMicDeviceId = '';
          selectedMicLabel = 'None';
          micHint.textContent = 'No microphone devices were detected.';
          diag.textContent = 'Browser reports 0 microphone devices.';
          return;
        }
        micSelect.disabled = false;
        micSelect.innerHTML = '';
        jacktripSourceDetected = mics.some((m) => {
          const label = String(m.label || '').toLowerCase();
          return label.includes('jacktrip') || label.includes('monitor of jacktrip_duet') || label.includes('duet mic');
        });
        const savedDeviceId = localStorage.getItem(MIC_DEVICE_STORAGE_KEY) || '';
        const preferredIdx = findPreferredMicIndex(mics, savedDeviceId);
	        mics.forEach((m, idx) => {
	          const opt = document.createElement('option');
	          opt.value = m.deviceId || '';
	          opt.textContent = (idx + 1) + '. ' + (m.label || '(unlabeled device)');
	          if (idx === preferredIdx) opt.selected = true;
	          micSelect.appendChild(opt);
	        });
	        setSelectedMicFromSelect();
	        diag.textContent = mics.map((m, idx) =>
	          (idx + 1) + '. ' + (m.label || '(unlabeled device)')
	        ).join('\\n');
      } catch (e) {
        diag.textContent = 'Could not enumerate microphones: ' + errText(e);
      }
    }

	    async function fetchBridgeToken() {
	      const res = await fetch('/duet/' + roomId + '/bridge/token', {
	        method: 'POST',
	        headers: {
	          'content-type': 'application/json',
	          'authorization': 'Bearer ' + bridgeTicket,
	        },
	        body: JSON.stringify({}),
	      });
	      const body = await res.json().catch(() => ({}));
	      if (!res.ok) {
	        const err = new Error(body.error || ('HTTP ' + res.status));
	        err.name = 'bridge_token_error';
	        err.status = res.status;
	        err.body = body;
	        err.debug = {
	          roomId,
	          http_status: res.status,
	        };
	        throw err;
	      }
	      return body;
	    }

    async function createToneTrack() {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) throw new Error('AudioContext unsupported');
      if (!AgoraRTC.createCustomAudioTrack) throw new Error('Custom audio track unsupported in this browser');

      toneContext = new Ctx();
      const gain = toneContext.createGain();
      gain.gain.value = 0.06;
      toneOscillator = toneContext.createOscillator();
      toneOscillator.type = 'sine';
      toneOscillator.frequency.value = 440;
      const destination = toneContext.createMediaStreamDestination();
      toneOscillator.connect(gain);
      gain.connect(destination);
      toneOscillator.start();

      const mediaTrack = destination.stream.getAudioTracks()[0];
      if (!mediaTrack) throw new Error('Failed to create tone media track');
      broadcastMode = 'tone';
      return AgoraRTC.createCustomAudioTrack({ mediaStreamTrack: mediaTrack });
    }

    async function createSharedAudioTrack() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
        throw new Error('display_capture_unsupported');
      }
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: {
          systemAudio: 'include',
          suppressLocalAudioPlayback: false,
        },
      });
      sharedMediaStream = stream;

      const audioTracks = stream.getAudioTracks();
      if (!audioTracks || audioTracks.length === 0) {
        stream.getTracks().forEach((t) => t.stop());
        sharedMediaStream = null;
        setMessage('Display share did not provide system audio. Falling back to selected microphone source.', true);
        return createMicTrackOrFallback(false);
      }

      stream.getVideoTracks().forEach((t) => t.stop());

      const mediaTrack = audioTracks[0];
      broadcastMode = 'share';
      return AgoraRTC.createCustomAudioTrack({ mediaStreamTrack: mediaTrack });
    }

    async function createMicTrackOrFallback(preferTone) {
      if (preferTone) {
        return createToneTrack();
      }
      try {
        broadcastMode = 'mic';
        if (selectedMicDeviceId) {
          return await AgoraRTC.createMicrophoneAudioTrack({ microphoneId: selectedMicDeviceId });
        }
        return await AgoraRTC.createMicrophoneAudioTrack();
      } catch (e) {
        if (!isDeviceError(e)) throw e;
        setMessage('No usable mic device found. Falling back to test tone.', true);
        return createToneTrack();
      }
    }

	    async function joinAndPublish(mode) {
	      const creds = await fetchBridgeToken();
	      if (!creds.agora_broadcaster_token || !creds.agora_channel) {
	        const err = new Error('invalid_bridge_credentials');
	        err.name = 'bridge_credentials_error';
	        err.debug = {
	          roomId,
	          has_channel: !!creds.agora_channel,
	          has_token: !!creds.agora_broadcaster_token,
	        };
	        throw err;
	      }

	      client = AgoraRTC.createClient({ mode: 'live', codec: 'vp8' });
	      await client.setClientRole('host');
	      try {
	        setMessage('Joining Agora...');
	        await client.join(appId, creds.agora_channel, creds.agora_broadcaster_token, creds.agora_broadcaster_uid);
	      } catch (e) {
	        try {
	          e.debug = {
	            roomId,
	            mode,
	            appId,
	            agora_channel: creds.agora_channel,
	            agora_uid: creds.agora_broadcaster_uid,
	            token_len: String(creds.agora_broadcaster_token || '').length,
	            sdk_version: AgoraRTC && AgoraRTC.VERSION ? String(AgoraRTC.VERSION) : undefined,
	            ua: navigator && navigator.userAgent ? String(navigator.userAgent) : undefined,
	          };
	        } catch (_) {}
	        throw e;
	      }
	      if (mode === 'share') {
	        audioTrack = await createSharedAudioTrack();
	      } else {
	        audioTrack = await createMicTrackOrFallback(mode === 'tone');
      }
      await client.publish([audioTrack]);
    }

	    async function startBroadcast(mode = 'mic') {
	      setError('');
	      setMessage('Requesting bridge credentials...');
	      setState('Starting…', 'idle');
	      shareBtn.disabled = true;
	      startBtn.disabled = true;
	      toneBtn.disabled = true;
	      try {
	        await joinAndPublish(mode);
        if (broadcastMode === 'share') {
          setState('Live · App Audio', 'live');
          setMessage('Shared audio is live.');
        } else if (broadcastMode === 'tone') {
          setState('Live · Test Tone', 'live');
          setMessage('Test tone is live. Audience on /watch should now hear a sine tone.');
        } else {
          setState('Live · Microphone', 'live');
          setMessage('Mic broadcast is live using: ' + selectedMicLabel + '.');
        }
        await sendHeartbeat('live', broadcastMode);
        startHeartbeatLoop();
	        stopBtn.disabled = false;
	      } catch (e) {
	        console.error('broadcast start failed', e);
	        setError(errDetails(e));
	        await stopBroadcast(true);
	        if (!message.textContent) {
	          setMessage('Could not start broadcast.', true);
	        }
	        shareBtn.disabled = false;
        startBtn.disabled = false;
        toneBtn.disabled = false;
      }
    }

    async function stopBroadcast(silent = false) {
      const previousMode = broadcastMode || undefined;
      stopHeartbeatLoop();
      try {
        if (audioTrack && client) {
          await client.unpublish([audioTrack]);
        }
        if (audioTrack) {
          audioTrack.stop();
          audioTrack.close();
          audioTrack = null;
        }
        if (sharedMediaStream) {
          sharedMediaStream.getTracks().forEach((t) => t.stop());
          sharedMediaStream = null;
        }
        if (toneOscillator) {
          toneOscillator.stop();
          toneOscillator.disconnect();
          toneOscillator = null;
        }
        if (toneContext) {
          await toneContext.close();
          toneContext = null;
        }
        if (client) {
          await client.leave();
          client = null;
        }
        broadcastMode = '';
        if (previousMode) {
          await sendHeartbeat('stopped', previousMode);
        }
        if (!silent) {
          setState('Stopped', 'idle');
          setMessage('Broadcast stopped.');
        }
      } catch (e) {
        setError(errText(e));
      } finally {
        stopBtn.disabled = true;
        shareBtn.disabled = false;
        startBtn.disabled = false;
        toneBtn.disabled = false;
      }
    }

    shareBtn.addEventListener('click', () => startBroadcast('share'));
    startBtn.addEventListener('click', () => startBroadcast('mic'));
    toneBtn.addEventListener('click', () => startBroadcast('tone'));
    stopBtn.addEventListener('click', stopBroadcast);
    micSelect.addEventListener('change', () => {
      setSelectedMicFromSelect();
      setMessage('Mic source updated.');
      setError('');
    });
    refreshMicsBtn.addEventListener('click', () => {
      void writeDeviceDiagnostics();
    });
    window.addEventListener('beforeunload', () => { void stopBroadcast(); });

    if (!${JSON.stringify(hasBridgeTicket)}) {
      shareBtn.disabled = true;
      startBtn.disabled = true;
      toneBtn.disabled = true;
      setState('Blocked', 'error');
      setMessage('Missing bridge ticket in URL.', true);
    } else if (!${JSON.stringify(appConfigured)}) {
      shareBtn.disabled = true;
      startBtn.disabled = true;
      toneBtn.disabled = true;
      setState('Blocked', 'error');
      setMessage('Agora app is not configured on this worker.', true);
	    } else {
	      setState('Ready');
	      setMessage('Ready. Start App Audio Share or Start Mic Broadcast.');
	      void writeDeviceDiagnostics();
	    }
	  </script>
</body>
</html>`

  return c.html(html)
})

duetRoutes.post('/:id/end', async (c) => {
  const wallet = await requireWallet(c, c.env)
  if (!wallet) return c.json({ error: 'unauthorized' }, 401)

  const roomId = c.req.param('id')
  const stub = getDuetRoomStub(c.env, roomId)
  const doResp = await stub.fetch(new Request('http://do/end', {
    method: 'POST',
    body: JSON.stringify({ wallet }),
  }))

  const forwarded = await forwardDoResponse(doResp)
  if (forwarded.ok) {
    const payload = await forwarded.clone().json<any>().catch(() => null)
    const endedAt = asOptionalEpoch(payload?.ended_at) ?? nowEpochSeconds()
    await updateDuetDiscoveryStatus(c.env, roomId, 'ended', null, endedAt)
  }
  return forwarded
})

duetRoutes.post('/:id/broadcast/heartbeat', async (c) => {
  const bridgeTicket = getBearerToken(c.req.header('authorization'))
  if (!bridgeTicket) return c.json({ error: 'bridge_ticket_required' }, 401)

  const roomId = c.req.param('id')
  const body = await c.req.json<{ status?: 'live' | 'stopped'; mode?: string }>()
    .catch(() => ({} as { status?: 'live' | 'stopped'; mode?: string }))
  const stub = getDuetRoomStub(c.env, roomId)
  const doResp = await stub.fetch(new Request('http://do/broadcast-heartbeat', {
    method: 'POST',
    body: JSON.stringify({
      bridgeTicket,
      status: body.status,
      mode: body.mode,
    }),
  }))

  return forwardDoResponse(doResp)
})

duetRoutes.post('/:id/recording/complete', async (c) => {
  const bridgeTicket = getBearerToken(c.req.header('authorization'))
  if (!bridgeTicket) return c.json({ error: 'bridge_ticket_required' }, 401)

  const body = await c.req.json<{
    load_dataitem_id?: string
    replay_url?: string
    replay_x402_url?: string
    created_at?: number
  }>().catch(() => ({}))

  const roomId = c.req.param('id')
  const stub = getDuetRoomStub(c.env, roomId)
  const doResp = await stub.fetch(new Request('http://do/recording-complete', {
    method: 'POST',
    body: JSON.stringify({
      bridgeTicket,
      load_dataitem_id: body.load_dataitem_id,
      replay_url: body.replay_url,
      replay_x402_url: body.replay_x402_url,
      created_at: body.created_at,
    }),
  }))

  return forwardDoResponse(doResp)
})

duetRoutes.get('/:id/replay/source', async (c) => {
  const token = c.req.query('token')
  if (!token) return c.json({ error: 'missing_replay_access_token' }, 400)

  const roomId = c.req.param('id')
  const stub = getDuetRoomStub(c.env, roomId)
  const doResp = await stub.fetch(new Request('http://do/replay-source', {
    method: 'POST',
    body: JSON.stringify({ token }),
  }))

  if (!doResp.ok) {
    return forwardDoResponse(doResp)
  }

  const payload = await doResp.json<{ replay_url?: string }>()
  if (!payload.replay_url) {
    return c.json({ error: 'invalid_replay_source' }, 500)
  }

  const upstream = await fetch(payload.replay_url)
  if (!upstream.ok) {
    return c.json({ error: 'replay_fetch_failed', status: upstream.status }, 502)
  }

  const headers = new Headers({
    'Cache-Control': 'no-store',
  })
  const contentType = upstream.headers.get('Content-Type')
  if (contentType) headers.set('Content-Type', contentType)
  const contentLength = upstream.headers.get('Content-Length')
  if (contentLength) headers.set('Content-Length', contentLength)
  const contentRange = upstream.headers.get('Content-Range')
  if (contentRange) headers.set('Content-Range', contentRange)
  const acceptRanges = upstream.headers.get('Accept-Ranges')
  if (acceptRanges) headers.set('Accept-Ranges', acceptRanges)

  return new Response(upstream.body, {
    status: upstream.status,
    headers,
  })
})

duetRoutes.get('/:id/replay', async (c) => {
  const auth = c.req.header('authorization')
  const wallet = await resolveOptionalWallet(auth, c.env)
  if (auth && !wallet) return c.json({ error: 'unauthorized' }, 401)

  const roomId = c.req.param('id')
  const paymentSignature = c.req.header('payment-signature') || undefined
  const stub = getDuetRoomStub(c.env, roomId)
  const doResp = await stub.fetch(new Request('http://do/replay-access', {
    method: 'POST',
    body: JSON.stringify({
      wallet: wallet ?? undefined,
      paymentSignature,
      resource: `/duet/${roomId}/replay`,
    }),
  }))

  return forwardDoResponse(doResp)
})

function getDuetRoomStub(env: Env, roomId: string): DurableObjectStub {
  const id = env.DUET_ROOM_DO.idFromName(roomId)
  return env.DUET_ROOM_DO.get(id)
}

async function requireWallet(c: any, env: Env): Promise<string | null> {
  const auth = c.req.header('authorization')
  return resolveOptionalWallet(auth, env)
}

async function resolveOptionalWallet(authHeader: string | undefined, env: Env): Promise<string | null> {
  if (!authHeader) return null
  if (!authHeader.startsWith('Bearer ')) return null
  const payload = await verifyJWT(authHeader.slice(7), env.JWT_SECRET)
  return payload?.sub ?? null
}

function getBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.slice(7).trim()
  return token.length > 0 ? token : null
}

async function forwardDoResponse(doResp: Response): Promise<Response> {
  const text = await doResp.text()
  const headers = new Headers({
    'Content-Type': doResp.headers.get('Content-Type') || 'application/json',
    'Access-Control-Expose-Headers': 'PAYMENT-REQUIRED, PAYMENT-RESPONSE',
  })

  const paymentRequired = doResp.headers.get('PAYMENT-REQUIRED')
  if (paymentRequired) headers.set('PAYMENT-REQUIRED', paymentRequired)

  const paymentResponse = doResp.headers.get('PAYMENT-RESPONSE')
  if (paymentResponse) headers.set('PAYMENT-RESPONSE', paymentResponse)

  return new Response(text, {
    status: doResp.status,
    headers,
  })
}

function defaultUsdcForNetwork(network: NetworkId): string {
  return network === 'eip155:8453' ? BASE_MAINNET_USDC : BASE_SEPOLIA_USDC
}

/**
 * Accepts:
 * - undefined -> fallback
 * - number (USDC, e.g. 0.1) -> base units
 * - decimal string (USDC, e.g. "0.1") -> base units
 * - integer string (already base units, e.g. "100000")
 */
function parseUsdcAmountToBaseUnits(value: string | number | undefined, fallback: string): string | null {
  if (value === undefined || value === null) return fallback

  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) return null
    if (value === 0) return '0'
    return Math.round(value * 1_000_000).toString()
  }

  const trimmed = value.trim()
  if (/^\d+$/.test(trimmed)) {
    return trimmed
  }

  if (!/^\d+(\.\d{1,6})?$/.test(trimmed)) return null

  const [whole, fracRaw] = trimmed.split('.')
  const frac = (fracRaw ?? '').padEnd(6, '0')
  const baseUnits = `${whole}${frac}`.replace(/^0+/, '') || '0'
  return baseUnits
}

function normalizeRoomTitle(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.slice(0, 120)
}

function normalizeRoomKind(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  if (!normalized) return null
  if (normalized === 'dj_set' || normalized === 'duet' || normalized === 'open_jam' || normalized === 'class') {
    return normalized
  }
  return null
}

function nowEpochSeconds(): number {
  return Math.floor(Date.now() / 1000)
}

function asOptionalEpoch(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.floor(value)
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return Math.floor(parsed)
  }
  return null
}

function toNonNegativeInt(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.floor(value))
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return Math.max(0, Math.floor(parsed))
  }
  return 0
}

async function upsertDuetDiscoveryRow(env: Env, row: DuetDiscoverUpsertRow): Promise<void> {
  const discoveryDb = getDiscoveryDb(env)
  if (!discoveryDb) return
  try {
    await discoveryDb.prepare(
      `INSERT INTO duet_rooms (
        room_id,
        host_wallet,
        guest_wallet,
        status,
        split_address,
        network,
        live_amount,
        replay_amount,
        audience_mode,
        visibility,
        title,
        room_kind,
        listener_count,
        live_started_at,
        ended_at,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(room_id) DO UPDATE SET
        host_wallet = excluded.host_wallet,
        guest_wallet = COALESCE(excluded.guest_wallet, duet_rooms.guest_wallet),
        status = excluded.status,
        split_address = excluded.split_address,
        network = excluded.network,
        live_amount = excluded.live_amount,
        replay_amount = excluded.replay_amount,
        audience_mode = excluded.audience_mode,
        visibility = excluded.visibility,
        title = COALESCE(excluded.title, duet_rooms.title),
        room_kind = COALESCE(excluded.room_kind, duet_rooms.room_kind),
        listener_count = MAX(duet_rooms.listener_count, excluded.listener_count),
        live_started_at = COALESCE(excluded.live_started_at, duet_rooms.live_started_at),
        ended_at = COALESCE(excluded.ended_at, duet_rooms.ended_at),
        updated_at = excluded.updated_at`,
    )
      .bind(
        row.room_id,
        row.host_wallet,
        row.guest_wallet,
        row.status,
        row.split_address,
        row.network,
        row.live_amount,
        row.replay_amount,
        row.audience_mode,
        row.visibility,
        row.title,
        row.room_kind,
        row.listener_count,
        row.live_started_at,
        row.ended_at,
        row.created_at,
        row.updated_at,
      )
      .run()
  } catch (err) {
    console.warn('[duet/discover] upsert failed:', String(err))
  }
}

async function updateDuetDiscoveryGuest(env: Env, roomId: string, guestWallet: string): Promise<void> {
  const discoveryDb = getDiscoveryDb(env)
  if (!discoveryDb) return
  try {
    await discoveryDb.prepare(
      `UPDATE duet_rooms
       SET guest_wallet = ?,
           updated_at = ?
       WHERE room_id = ?`,
    )
      .bind(guestWallet, nowEpochSeconds(), roomId)
      .run()
  } catch (err) {
    console.warn('[duet/discover] guest update failed:', String(err))
  }
}

async function updateDuetDiscoveryStatus(
  env: Env,
  roomId: string,
  status: RoomStatus,
  liveStartedAt: number | null,
  endedAt: number | null,
): Promise<void> {
  const discoveryDb = getDiscoveryDb(env)
  if (!discoveryDb) return
  try {
    await discoveryDb.prepare(
      `UPDATE duet_rooms
       SET status = ?,
           live_started_at = COALESCE(?, live_started_at),
           ended_at = COALESCE(?, ended_at),
           updated_at = ?
       WHERE room_id = ?`,
    )
      .bind(status, liveStartedAt, endedAt, nowEpochSeconds(), roomId)
      .run()
  } catch (err) {
    console.warn('[duet/discover] status update failed:', String(err))
  }
}

async function incrementDuetDiscoveryListenerCount(env: Env, roomId: string): Promise<void> {
  const discoveryDb = getDiscoveryDb(env)
  if (!discoveryDb) return
  try {
    await discoveryDb.prepare(
      `UPDATE duet_rooms
       SET listener_count = listener_count + 1,
           updated_at = ?
       WHERE room_id = ?`,
    )
      .bind(nowEpochSeconds(), roomId)
      .run()
  } catch (err) {
    console.warn('[duet/discover] listener count increment failed:', String(err))
  }
}

function isAddress(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value)
}

function isNetworkId(value: string): value is NetworkId {
  return value === 'eip155:8453' || value === 'eip155:84532'
}

function isReplayMode(value: string): value is ReplayMode {
  return value === 'load_gated' || value === 'worker_gated'
}

function isRecordingMode(value: string): value is RecordingMode {
  return value === 'host_local' || value === 'agora_cloud'
}

function getDiscoveryDb(env: Env): D1Database | null {
  const db = (env as Partial<Env> & { DB?: D1Database }).DB
  if (!db || typeof db.prepare !== 'function') return null
  return db
}
