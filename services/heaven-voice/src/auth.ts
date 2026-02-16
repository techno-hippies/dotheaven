import { SignJWT, jwtVerify } from "jose";
import { verifyMessage, getAddress } from "ethers";
import type { Env } from "./env";
import { sha256Hex, randomB64Url } from "./crypto";

const JWT_TTL_SECONDS = 60 * 60; // 1h
const NONCE_TTL_MS = 10 * 60 * 1000; // 10 min

export async function issueJwt(env: Env, wallet: string): Promise<string> {
  const key = new TextEncoder().encode(env.JWT_SECRET);
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ sub: wallet })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(now)
    .setExpirationTime(now + JWT_TTL_SECONDS)
    .sign(key);
}

export async function verifyJwt(env: Env, token: string): Promise<string> {
  const key = new TextEncoder().encode(env.JWT_SECRET);
  const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
  if (!payload.sub || typeof payload.sub !== "string") throw new Error("Invalid token");
  return getAddress(payload.sub);
}

export function normalizeWallet(wallet: string): string {
  return getAddress(wallet);
}

export async function createNonce(env: Env, wallet: string): Promise<{ nonce: string; expiresAt: number }> {
  const w = normalizeWallet(wallet);
  const nonce = `neo:${randomB64Url(24)}`;
  const nonceHash = await sha256Hex(nonce);
  const now = Date.now();
  const expiresAt = now + NONCE_TTL_MS;

  await env.DB.prepare(
    "INSERT INTO nonces(wallet, nonce_hash, expires_at, created_at) VALUES(?, ?, ?, ?) " +
      "ON CONFLICT(wallet) DO UPDATE SET nonce_hash=excluded.nonce_hash, expires_at=excluded.expires_at, created_at=excluded.created_at"
  )
    .bind(w, nonceHash, expiresAt, now)
    .run();

  return { nonce, expiresAt };
}

export async function verifySignatureForNonce(env: Env, wallet: string, signature: string, nonce: string): Promise<boolean> {
  const w = normalizeWallet(wallet);

  const row = await env.DB.prepare("SELECT nonce_hash, expires_at FROM nonces WHERE wallet=?")
    .bind(w)
    .first<{ nonce_hash: string; expires_at: number }>();

  if (!row) return false;
  if (Date.now() > row.expires_at) return false;

  const nonceHash = await sha256Hex(nonce);
  if (nonceHash !== row.nonce_hash) return false;

  const recovered = verifyMessage(nonce, signature);
  const r = normalizeWallet(recovered);
  return r === w;
}
