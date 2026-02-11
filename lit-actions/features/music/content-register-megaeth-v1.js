/**
 * Content Register MegaETH-only v1
 *
 * Lightweight action: registers content on ContentRegistry (MegaETH only).
 * Skips Base mirror — used for published songs that don't need Lit decrypt gating.
 * Also registers track in ScrobbleV4 if not already registered.
 *
 * Flow:
 * 1. Verify EIP-191 signature
 * 2. Register track in ScrobbleV3 if needed
 * 3. Sponsor PKP broadcasts registerContentFor() on MegaETH
 *
 * Required jsParams:
 * - userPkpPublicKey: User PKP public key
 * - trackId: bytes32 hex string
 * - pieceCid: CID string (stored as bytes)
 * - algo: uint8 (encryption algorithm enum, must be >= 1)
 * - timestamp: Request timestamp (ms)
 * - nonce: Unique nonce
 * - title: Track title
 * - artist: Track artist
 *
 * Optional:
 * - album: Track album (defaults to "")
 * - datasetOwner: Override dataset owner (defaults to user)
 * - signature: Pre-signed EIP-191 signature
 */

let ethersLib = globalThis.ethers;
if (!ethersLib) ethersLib = require("ethers");
const ethers = ethersLib;

// ── Constants ──────────────────────────────────────────────────────

const MEGAETH_CHAIN_ID = 6343;
const MEGAETH_RPC_URL = "https://carrot.megaeth.com/rpc";
const CONTENT_REGISTRY = "0x9ca08C2D2170A43ecfA12AB35e06F2E1cEEB4Ef2";
const SCROBBLE_V4 = "0xBcD4EbBb964182ffC5EA03FF70761770a326Ccf1";

const SPONSOR_PKP_PUBLIC_KEY =
  "04fb425233a6b6c7628c42570d074d53fc7b4211464c9fc05f84a0f15f7d10cc2b149a2fca26f69539310b0ee129577b9d368015f207ce8719e5ef9040e340a0a5";
const SPONSOR_PKP_ADDRESS = "0xF2a9Ea42e5eD701AE5E7532d4217AE94D3F03455";

const MEGAETH_GAS_PRICE = "1000000";
const MEGAETH_GAS_LIMIT = "2000000";
const MAX_CID = 128;

// ── Helpers ────────────────────────────────────────────────────────

const must = (v, label) => {
  if (v === undefined || v === null) throw new Error(`${label} is required`);
  return v;
};

const toBigNumber = (v, label) => {
  if (typeof v === "number") return ethers.BigNumber.from(v);
  if (typeof v === "string") return ethers.BigNumber.from(v);
  throw new Error(`Invalid ${label}`);
};

function toBytes(input, label) {
  if (typeof input !== "string") throw new Error(`${label} must be string`);
  if (input.startsWith("0x")) return ethers.utils.arrayify(input);
  return new TextEncoder().encode(input);
}

async function sha256Hex(message) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(message));
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function signTx(unsignedTx, sigName) {
  const serialized = ethers.utils.serializeTransaction(unsignedTx);
  const hash = ethers.utils.keccak256(serialized);
  const toSign = ethers.utils.arrayify(hash);

  const sigShare = await Lit.Actions.signAndCombineEcdsa({
    toSign,
    publicKey: SPONSOR_PKP_PUBLIC_KEY,
    sigName,
  });

  const sig = JSON.parse(sigShare);
  const r = `0x${sig.r.padStart(64, "0")}`;
  const s = `0x${sig.s.padStart(64, "0")}`;
  const v = sig.recid + (unsignedTx.type === 2 ? 0 : 27);

  return ethers.utils.serializeTransaction(unsignedTx, { r, s, v });
}

async function broadcastSignedTx(signedTx, rpcUrl, label) {
  const result = await Lit.Actions.runOnce(
    { waitForResponse: true, name: `broadcast_${label}` },
    async () => {
      const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
      const resp = await provider.sendTransaction(signedTx);
      const receipt = await resp.wait(1);
      return JSON.stringify({
        txHash: receipt.transactionHash,
        blockNumber: receipt.blockNumber,
      });
    }
  );
  const parsed = JSON.parse(result);
  if (!parsed.txHash) throw new Error(`TX broadcast failed (${label}): no txHash`);
  return parsed;
}

// ── ABIs ───────────────────────────────────────────────────────────

const CONTENT_REGISTRY_ABI = [
  "function registerContentFor(address contentOwner, bytes32 trackId, address datasetOwner, bytes pieceCid, uint8 algo) external returns (bytes32 contentId)",
];

const SCROBBLE_V4_ABI = [
  "function isRegistered(bytes32 trackId) external view returns (bool)",
  "function registerTracksBatch(uint8[] kinds, bytes32[] payloads, string[] titles, string[] artists, string[] albums, uint32[] durations) external",
];

// ── Main ───────────────────────────────────────────────────────────

(async () => {
  try {
    const trackId = must(jsParams.trackId, "trackId");
    const pieceCid = must(jsParams.pieceCid, "pieceCid");
    const algo = must(jsParams.algo, "algo");
    const timestamp = must(jsParams.timestamp, "timestamp");
    const nonce = must(jsParams.nonce, "nonce");
    const title = must(jsParams.title, "title");
    const artist = must(jsParams.artist, "artist");
    const album = jsParams.album || "";

    const algoNum = Number(algo);
    if (algoNum < 1) throw new Error("algo must be >= 1");

    const trackId32 = ethers.utils.hexZeroPad(trackId, 32).toLowerCase();
    const pieceBytes = toBytes(pieceCid, "pieceCid");
    if (pieceBytes.length === 0) throw new Error("pieceCid is empty");
    if (pieceBytes.length > MAX_CID) throw new Error("pieceCid too long");

    // Freshness check
    const age = Date.now() - Number(timestamp);
    if (age > 5 * 60 * 1000) throw new Error("Request expired");

    // Derive user address
    let userAddress;
    const preSignedSig = jsParams.signature;

    if (jsParams.userPkpPublicKey) {
      userAddress = ethers.utils.computeAddress(`0x${jsParams.userPkpPublicKey}`).toLowerCase();
    }

    // Verify or create signature
    const pieceCidHash = await sha256Hex(pieceCid);
    const datasetOwner = jsParams.datasetOwner
      ? jsParams.datasetOwner.toLowerCase()
      : userAddress;
    const message = `heaven:content:register:${trackId32}:${pieceCidHash}:${datasetOwner}:${algoNum}:${timestamp}:${nonce}`;

    let signature;
    if (preSignedSig) {
      signature = preSignedSig;
      const recovered = ethers.utils.verifyMessage(message, signature).toLowerCase();
      if (!userAddress) userAddress = recovered;
      if (recovered !== userAddress) throw new Error("Signature mismatch");
    } else {
      const toSign = ethers.utils.arrayify(ethers.utils.hashMessage(message));
      const sigShare = await Lit.Actions.signAndCombineEcdsa({
        toSign,
        publicKey: jsParams.userPkpPublicKey,
        sigName: "userSig",
      });
      const sig = JSON.parse(sigShare);
      signature = ethers.utils.joinSignature({
        r: `0x${sig.r.padStart(64, "0")}`,
        s: `0x${sig.s.padStart(64, "0")}`,
        v: sig.recid + 27,
      });
    }

    const datasetOwnerAddr = ethers.utils.getAddress(datasetOwner || userAddress);
    const computedContentId = ethers.utils.keccak256(
      ethers.utils.defaultAbiCoder.encode(["bytes32", "address"], [trackId32, userAddress])
    );

    // ── Register track in ScrobbleV4 if needed ────────────────────
    let trackRegistered = false;
    const scrobbleContract = new ethers.Contract(SCROBBLE_V4, SCROBBLE_V4_ABI);

    const isRegJson = await Lit.Actions.runOnce(
      { waitForResponse: true, name: "checkTrackRegistered" },
      async () => {
        const provider = new ethers.providers.JsonRpcProvider(MEGAETH_RPC_URL);
        const c = scrobbleContract.connect(provider);
        const registered = await c.isRegistered(trackId32);
        return JSON.stringify({ registered });
      }
    );
    const { registered: isReg } = JSON.parse(isRegJson);

    if (!isReg) {
      const titleNorm = (title || "").toLowerCase().trim().replace(/\s+/g, " ");
      const artistNorm = (artist || "").toLowerCase().trim().replace(/\s+/g, " ");
      const albumNorm = (album || "").toLowerCase().trim().replace(/\s+/g, " ");

      const metaPayload = ethers.utils.keccak256(
        ethers.utils.defaultAbiCoder.encode(
          ["string", "string", "string"],
          [titleNorm, artistNorm, albumNorm]
        )
      );
      const kind = 3;

      const regIface = new ethers.utils.Interface(SCROBBLE_V4_ABI);
      const regData = regIface.encodeFunctionData("registerTracksBatch", [
        [kind], [metaPayload], [title], [artist], [album], [0],
      ]);

      const regNonceResult = JSON.parse(
        await Lit.Actions.runOnce(
          { waitForResponse: true, name: "getRegNonce" },
          async () => {
            const provider = new ethers.providers.JsonRpcProvider(MEGAETH_RPC_URL);
            const n = await provider.getTransactionCount(SPONSOR_PKP_ADDRESS, "pending");
            return JSON.stringify({ nonce: n.toString() });
          }
        )
      );

      const unsignedRegTx = {
        type: 0,
        chainId: MEGAETH_CHAIN_ID,
        nonce: toBigNumber(regNonceResult.nonce, "regNonce"),
        to: SCROBBLE_V4,
        data: regData,
        gasLimit: toBigNumber("2000000", "gasLimit"),
        gasPrice: toBigNumber(MEGAETH_GAS_PRICE, "gasPrice"),
        value: 0,
      };

      const regSigned = await signTx(unsignedRegTx, "registerTrack_mega");
      await broadcastSignedTx(regSigned, MEGAETH_RPC_URL, "registerTrack_mega");
      trackRegistered = true;
    }

    // ── Register content on MegaETH ContentRegistry ──────────────
    const iface = new ethers.utils.Interface(CONTENT_REGISTRY_ABI);
    const txData = iface.encodeFunctionData("registerContentFor", [
      userAddress,
      trackId32,
      datasetOwnerAddr,
      ethers.utils.hexlify(pieceBytes),
      algoNum,
    ]);

    const nonceJson = await Lit.Actions.runOnce(
      { waitForResponse: true, name: "getTxNonce" },
      async () => {
        const provider = new ethers.providers.JsonRpcProvider(MEGAETH_RPC_URL);
        const n = await provider.getTransactionCount(SPONSOR_PKP_ADDRESS, "pending");
        return JSON.stringify({ nonce: n.toString() });
      }
    );
    const txNonce = Number(JSON.parse(nonceJson).nonce);

    const unsignedTx = {
      type: 0,
      chainId: MEGAETH_CHAIN_ID,
      nonce: toBigNumber(txNonce, "txNonce"),
      to: CONTENT_REGISTRY,
      data: txData,
      gasLimit: toBigNumber(MEGAETH_GAS_LIMIT, "gasLimit"),
      gasPrice: toBigNumber(MEGAETH_GAS_PRICE, "gasPrice"),
      value: 0,
    };

    const signedTx = await signTx(unsignedTx, "registerContent_mega");
    const broadcast = await broadcastSignedTx(signedTx, MEGAETH_RPC_URL, "registerContent_mega");

    Lit.Actions.setResponse({
      response: JSON.stringify({
        success: true,
        version: "content-register-megaeth-v1",
        user: userAddress,
        contentId: computedContentId,
        txHash: broadcast.txHash,
        blockNumber: broadcast.blockNumber,
        trackRegistered,
      }),
    });
  } catch (err) {
    Lit.Actions.setResponse({
      response: JSON.stringify({
        success: false,
        error: err.message || String(err),
        version: "content-register-megaeth-v1",
      }),
    });
  }
})();
