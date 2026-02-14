import { Buffer } from 'buffer';
import { keccak256, sha256, toBytes } from 'viem';

import {
  litRustNativeCreatePasskey,
  litRustNativeGetPasskey,
  litRustTestConnect,
} from './LitRustNative';

const AUTH_METHOD_TYPE_WEBAUTHN = 3;
const DEFAULT_SCOPES = ['sign-anything', 'personal-sign'];
const BLOCKHASH_URL = 'https://block-indexer.litgateway.com/get_most_recent_valid_block';
const MINT_STATUS_MAX_ATTEMPTS = 20;
const MINT_STATUS_POLL_DELAY_MS = 3000;

export type NativePasskeyAuthData = {
  authMethodType: number;
  authMethodId: string;
  accessToken: string;
};

export type NativePasskeyRegisterAndMintResult = {
  pkpInfo: unknown;
  webAuthnPublicKey: string;
  authData: NativePasskeyAuthData;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requireString(value: unknown, fieldName: string): string {
  const parsed = typeof value === 'string' ? value.trim() : '';
  if (!parsed) throw new Error(`${fieldName} cannot be empty`);
  return parsed;
}

function sanitizeBaseUrl(value: string): string {
  return requireString(value, 'authServiceBaseUrl').replace(/\/+$/, '');
}

function buildAuthServiceHeaders(passkeyRpId: string): Record<string, string> {
  const origin = `https://${passkeyRpId}`;
  return {
    Origin: origin,
    Referer: `${origin}/`,
  };
}

function parseHostname(value: string, fieldName: string): string {
  const trimmed = requireString(value, fieldName);
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    throw new Error(`Invalid ${fieldName}: ${value}`);
  }
  const hostname = parsed.hostname.trim().toLowerCase();
  if (!hostname) throw new Error(`Invalid ${fieldName}: ${value}`);
  return hostname;
}

function normalizeRpIdHost(value: string): string {
  return parseHostname(value, 'passkeyRpId');
}

function hexToBytes(value: string): Uint8Array {
  const normalized = value.startsWith('0x') ? value.slice(2) : value;
  if (!/^[0-9a-fA-F]+$/.test(normalized) || normalized.length % 2 !== 0) {
    throw new Error(`Invalid hex value: ${value}`);
  }
  const bytes = new Uint8Array(normalized.length / 2);
  for (let index = 0; index < normalized.length; index += 2) {
    bytes[index / 2] = parseInt(normalized.slice(index, index + 2), 16);
  }
  return bytes;
}

function toBase64Url(value: Uint8Array): string {
  const base64 = Buffer.from(value).toString('base64');
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  return new Uint8Array(Buffer.from(padded, 'base64'));
}

function canonicalizeBase64Like(value: string): string {
  return toBase64Url(base64UrlToBytes(value));
}

function canonicalizeCredentialId(value: string): string {
  return canonicalizeBase64Like(value);
}

function bytesToHex(value: Uint8Array): string {
  return Buffer.from(value).toString('hex');
}

function deriveWebAuthnAuthMethodId(rawId: string): string {
  return keccak256(toBytes(`${rawId}:lit`));
}

function inspectWebAuthnAssertion(
  authenticationResponse: Record<string, unknown>,
  expectedRpId: string,
): {
  expectedRpIdHashHex: string;
  authenticatorRpIdHashHex?: string;
  rpIdHashMatchesExpected: boolean;
  clientDataOrigin?: string;
  clientDataOriginHost?: string;
} {
  const expectedRpIdHashHex = sha256(toBytes(expectedRpId)).slice(2).toLowerCase();
  const inspection: {
    expectedRpIdHashHex: string;
    authenticatorRpIdHashHex?: string;
    rpIdHashMatchesExpected: boolean;
    clientDataOrigin?: string;
    clientDataOriginHost?: string;
  } = {
    expectedRpIdHashHex,
    rpIdHashMatchesExpected: false,
  };

  try {
    const response = authenticationResponse.response as Record<string, unknown> | undefined;
    const clientDataJsonB64 =
      response && typeof response.clientDataJSON === 'string' ? response.clientDataJSON : undefined;
    const authenticatorDataB64 =
      response && typeof response.authenticatorData === 'string'
        ? response.authenticatorData
        : undefined;

    if (clientDataJsonB64) {
      const clientDataJson = Buffer.from(base64UrlToBytes(clientDataJsonB64)).toString('utf8');
      const clientData = JSON.parse(clientDataJson) as { origin?: string };
      inspection.clientDataOrigin = typeof clientData.origin === 'string' ? clientData.origin : undefined;
      if (inspection.clientDataOrigin) {
        try {
          inspection.clientDataOriginHost = new URL(inspection.clientDataOrigin).hostname.toLowerCase();
        } catch {
          inspection.clientDataOriginHost = inspection.clientDataOrigin.toLowerCase();
        }
      }
    }

    if (authenticatorDataB64) {
      const authenticatorData = base64UrlToBytes(authenticatorDataB64);
      if (authenticatorData.length >= 32) {
        inspection.authenticatorRpIdHashHex = bytesToHex(authenticatorData.slice(0, 32)).toLowerCase();
      }
    }
  } catch {
    // best-effort diagnostics only
  }

  inspection.rpIdHashMatchesExpected =
    inspection.authenticatorRpIdHashHex != null &&
    inspection.authenticatorRpIdHashHex.toLowerCase() === expectedRpIdHashHex;
  return inspection;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const bodyText = await response.text();
  if (!response.ok) {
    throw new Error(`Request failed (${response.status}) ${url}: ${bodyText}`);
  }

  try {
    return JSON.parse(bodyText) as T;
  } catch {
    throw new Error(`Request returned non-JSON payload for ${url}: ${bodyText}`);
  }
}

async function fetchLatestBlockhashInfo(): Promise<{ blockhash: string }> {
  const data = await fetchJson<{ blockhash?: unknown }>(BLOCKHASH_URL);
  return { blockhash: requireString(data.blockhash, 'latest blockhash') };
}

function normalizeAuthenticationResponse(
  authenticationResponse: Record<string, unknown>,
): Record<string, unknown> {
  const response = (authenticationResponse.response ?? {}) as Record<string, unknown>;

  const rawIdInput = requireString(authenticationResponse.rawId, 'authentication response rawId');
  const normalizedRawId = canonicalizeCredentialId(rawIdInput);
  const normalizedId =
    typeof authenticationResponse.id === 'string' && authenticationResponse.id.trim().length > 0
      ? canonicalizeCredentialId(authenticationResponse.id)
      : normalizedRawId;

  const normalizeMaybeB64 = (field: unknown): unknown => {
    if (typeof field !== 'string' || field.trim().length === 0) return field;
    try {
      return canonicalizeBase64Like(field);
    } catch {
      return field;
    }
  };

  const normalizedResponse: Record<string, unknown> = {
    ...response,
    clientDataJSON: normalizeMaybeB64(response.clientDataJSON),
    authenticatorData: normalizeMaybeB64(response.authenticatorData),
    signature: normalizeMaybeB64(response.signature),
  };

  if (typeof response.userHandle === 'string') {
    normalizedResponse.userHandle = normalizeMaybeB64(response.userHandle);
  } else if (response.userHandle == null) {
    normalizedResponse.userHandle = null;
  }

  return {
    ...authenticationResponse,
    id: normalizedId,
    rawId: normalizedRawId,
    type:
      typeof authenticationResponse.type === 'string' && authenticationResponse.type.trim().length > 0
        ? authenticationResponse.type
        : 'public-key',
    clientExtensionResults:
      authenticationResponse.clientExtensionResults &&
      typeof authenticationResponse.clientExtensionResults === 'object'
        ? authenticationResponse.clientExtensionResults
        : {},
    response: normalizedResponse,
  };
}

async function getNativeWebAuthnAssertion(
  passkeyRpId: string,
  registrationRawId?: string,
): Promise<NativePasskeyAuthData> {
  const before = await fetchLatestBlockhashInfo();
  const challenge = toBase64Url(hexToBytes(before.blockhash));

  const authenticationOptions: Record<string, unknown> = {
    challenge,
    timeout: 60000,
    userVerification: 'required',
    rpId: passkeyRpId,
  };

  if (registrationRawId) {
    authenticationOptions.allowCredentials = [
      {
        id: registrationRawId,
        type: 'public-key',
      },
    ];
  }

  const authenticationResult = await litRustNativeGetPasskey(authenticationOptions);
  const rawAuthenticationResponse = JSON.parse(
    authenticationResult.authenticationResponseJson,
  ) as Record<string, unknown>;
  const authenticationResponse = normalizeAuthenticationResponse(rawAuthenticationResponse);

  const rawId = requireString(authenticationResponse.rawId, 'authentication response rawId');
  const authMethodId = deriveWebAuthnAuthMethodId(rawId);
  const inspection = inspectWebAuthnAssertion(authenticationResponse, passkeyRpId);

  if (!inspection.rpIdHashMatchesExpected) {
    throw new Error(
      `Native passkey assertion RP hash mismatch before Lit call. ` +
        `expected=${inspection.expectedRpIdHashHex} ` +
        `actual=${inspection.authenticatorRpIdHashHex || '(missing)'} ` +
        `origin=${inspection.clientDataOrigin || '(missing)'}`,
    );
  }

  return {
    authMethodType: AUTH_METHOD_TYPE_WEBAUTHN,
    authMethodId,
    accessToken: JSON.stringify(authenticationResponse),
  };
}

async function getRegistrationOptions(
  authServiceBaseUrl: string,
  username: string,
  expectedRpId: string,
  rpName: string,
): Promise<Record<string, unknown>> {
  const params = new URLSearchParams({
    username: requireString(username, 'username'),
  });
  const options = await fetchJson<Record<string, unknown>>(
    `${authServiceBaseUrl}/auth/webauthn/generate-registration-options?${params.toString()}`,
    {
      headers: buildAuthServiceHeaders(expectedRpId),
    },
  );

  const rp = (options.rp ?? {}) as Record<string, unknown>;
  const returnedRpId = typeof rp.id === 'string' ? rp.id.toLowerCase() : '';
  if (returnedRpId && returnedRpId !== expectedRpId) {
    throw new Error(
      `Auth service returned rp.id=${returnedRpId} but expected passkeyRpId=${expectedRpId}`,
    );
  }

  options.rp = {
    ...rp,
    id: expectedRpId,
    name: requireString(rpName, 'rpName'),
  };
  return options;
}

async function mintPkpWithAuthService(
  authServiceBaseUrl: string,
  passkeyRpId: string,
  registrationAuthMethodId: string,
  credentialPublicKey: string,
  scopes: string[],
): Promise<unknown> {
  const mintResponse = await fetch(`${authServiceBaseUrl}/pkp/mint`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...buildAuthServiceHeaders(passkeyRpId),
    },
    body: JSON.stringify({
      authMethodType: AUTH_METHOD_TYPE_WEBAUTHN,
      authMethodId: registrationAuthMethodId,
      pubkey: credentialPublicKey,
      scopes,
    }),
  });

  if (mintResponse.status !== 202) {
    const body = await mintResponse.text();
    throw new Error(`PKP mint failed: ${mintResponse.status} ${body}`);
  }

  const mintStart = (await mintResponse.json()) as { jobId?: unknown };
  const jobId = requireString(mintStart.jobId, 'pkp mint jobId');

  for (let attempt = 1; attempt <= MINT_STATUS_MAX_ATTEMPTS; attempt += 1) {
    await sleep(MINT_STATUS_POLL_DELAY_MS);
    const status = await fetchJson<{ state?: unknown; returnValue?: { data?: unknown } }>(
      `${authServiceBaseUrl}/status/${jobId}`,
      {
        headers: buildAuthServiceHeaders(passkeyRpId),
      },
    );
    const state = String(status.state || '').toLowerCase();

    if (state === 'completed' && status.returnValue?.data != null) {
      return status.returnValue.data;
    }

    if (state === 'failed' || state === 'error') {
      throw new Error(`PKP mint job failed: ${JSON.stringify(status)}`);
    }
  }

  throw new Error('PKP mint timed out');
}

export async function registerAndMintPKPWithNativePasskey(params: {
  network: string;
  rpcUrl: string;
  authServiceBaseUrl: string;
  expectedRpId: string;
  username?: string;
  rpName?: string;
  scopes?: string[];
}): Promise<NativePasskeyRegisterAndMintResult> {
  const authServiceBaseUrl = sanitizeBaseUrl(params.authServiceBaseUrl);
  const passkeyRpId = normalizeRpIdHost(params.expectedRpId);
  const username = params.username?.trim() ? String(params.username) : 'Heaven';
  const rpName = params.rpName?.trim() ? String(params.rpName) : 'Heaven';
  const scopes = params.scopes && params.scopes.length > 0 ? params.scopes : DEFAULT_SCOPES;

  const registrationOptions = await getRegistrationOptions(
    authServiceBaseUrl,
    username,
    passkeyRpId,
    rpName,
  );

  const registrationResult = await litRustNativeCreatePasskey(registrationOptions);
  const registrationResponse = JSON.parse(
    registrationResult.registrationResponseJson,
  ) as Record<string, unknown>;
  const registrationRawId = canonicalizeCredentialId(
    requireString(registrationResponse.rawId, 'registration response rawId'),
  );
  const registrationAuthMethodId = deriveWebAuthnAuthMethodId(registrationRawId);

  const pkpInfo = await mintPkpWithAuthService(
    authServiceBaseUrl,
    passkeyRpId,
    registrationAuthMethodId,
    requireString(registrationResult.credentialPublicKey, 'credentialPublicKey'),
    scopes,
  );

  // Warm the Lit node handshake before prompting the passkey so the access token stays fresh.
  await litRustTestConnect(params.network, requireString(params.rpcUrl, 'rpcUrl'));

  const authData = await getNativeWebAuthnAssertion(passkeyRpId, registrationRawId);

  return {
    pkpInfo,
    webAuthnPublicKey: registrationResult.credentialPublicKey,
    authData,
  };
}

export async function authenticateWithNativePasskey(params: {
  expectedRpId: string;
}): Promise<NativePasskeyAuthData> {
  const passkeyRpId = normalizeRpIdHost(params.expectedRpId);
  return getNativeWebAuthnAssertion(passkeyRpId);
}

