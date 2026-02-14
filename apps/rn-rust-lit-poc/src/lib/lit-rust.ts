import {
  requireOptionalNativeModule,
} from 'expo-modules-core';

export type LitRustNetwork =
  | 'naga-dev'
  | 'naga-test'
  | 'naga-staging'
  | 'naga-proto'
  | 'naga';

export type LitRustHealthcheck = {
  bridgeVersion: string;
  litNetworks: string[];
  target: string;
};

export type LitRustAuthData = {
  authMethodId: string;
  authMethodType: number;
  accessToken: string;
  publicKey?: string;
};

export type LitRustConnectResult = {
  network: string;
  connectedNodes: number;
  threshold: number;
  epoch: number;
  firstNode?: string;
};

export type LitRustMintAndAuthContextResult = {
  network: string;
  chainId: number;
  txHash: string;
  tokenId: string;
  pkpPublicKey: string;
  pkpEthAddress: string;
  authMethodId: string;
  sessionPublicKey: string;
  delegationSignatureAddress: string;
  delegationSignatureAlgo?: string;
};

export type LitRustPasskeyAuthContextResult = {
  network: string;
  pkpPublicKey: string;
  authMethodType: number;
  authMethodId: string;
  sessionPublicKey: string;
  delegationSignatureAddress: string;
  delegationSignatureAlgo?: string;
  connectedNodes: number;
  threshold: number;
  epoch: number;
};

export type LitRustNativeCreatePasskeyResult = {
  registrationResponseJson: string;
  credentialPublicKey: string;
};

export type LitRustNativeGetPasskeyResult = {
  authenticationResponseJson: string;
};

type Envelope<T> = {
  ok: boolean;
  result?: T;
  error?: string;
};

type HeavenLitRustNativeModule = {
  healthcheck(): Promise<string>;
  createEthWalletAuthData(privateKeyHex: string, nonce: string): Promise<string>;
  testConnect(network: string, rpcUrl: string): Promise<string>;
  mintPkpAndCreateAuthContext(
    network: string,
    rpcUrl: string,
    privateKeyHex: string,
  ): Promise<string>;
  createAuthContextFromPasskeyCallback(
    network: string,
    rpcUrl: string,
    pkpPublicKey: string,
    authMethodType: number,
    authMethodId: string,
    accessToken: string,
    domain: string,
  ): Promise<string>;
  nativeCreatePasskey(optionsJson: string): Promise<string>;
  nativeGetPasskey(optionsJson: string): Promise<string>;
};

const nativeModule = requireOptionalNativeModule<HeavenLitRustNativeModule>('HeavenLitRust');

function assertNativeModule(): HeavenLitRustNativeModule {
  if (!nativeModule) {
    throw new Error(
      'HeavenLitRust native module is not available. Run prebuild (`expo run:android` / `expo run:ios`) so Expo autolinks local modules from ./modules.',
    );
  }
  return nativeModule;
}

function parseEnvelope<T>(raw: string): T {
  let parsed: Envelope<T>;
  try {
    parsed = JSON.parse(raw) as Envelope<T>;
  } catch {
    throw new Error(`Rust bridge returned non-JSON output: ${raw}`);
  }

  if (!parsed.ok) {
    throw new Error(parsed.error || 'Rust bridge call failed');
  }

  if (parsed.result == null) {
    throw new Error('Rust bridge response missing result payload');
  }

  return parsed.result;
}

function parseJson<T>(raw: string, operationName: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error(`Native ${operationName} returned non-JSON output: ${raw}`);
  }
}

export async function litRustHealthcheck(): Promise<LitRustHealthcheck> {
  const raw = await assertNativeModule().healthcheck();
  return parseEnvelope<LitRustHealthcheck>(raw);
}

export async function litRustCreateEthWalletAuthData(
  privateKeyHex: string,
  nonce: string,
): Promise<LitRustAuthData> {
  const raw = await assertNativeModule().createEthWalletAuthData(privateKeyHex, nonce);
  return parseEnvelope<LitRustAuthData>(raw);
}

export async function litRustTestConnect(
  network: LitRustNetwork,
  rpcUrl: string,
): Promise<LitRustConnectResult> {
  const raw = await assertNativeModule().testConnect(network, rpcUrl);
  return parseEnvelope<LitRustConnectResult>(raw);
}

export async function litRustMintPkpAndCreateAuthContext(
  network: LitRustNetwork,
  rpcUrl: string,
  privateKeyHex: string,
): Promise<LitRustMintAndAuthContextResult> {
  const raw = await assertNativeModule().mintPkpAndCreateAuthContext(
    network,
    rpcUrl,
    privateKeyHex,
  );
  return parseEnvelope<LitRustMintAndAuthContextResult>(raw);
}

export async function litRustCreateAuthContextFromPasskeyCallback(
  network: LitRustNetwork,
  rpcUrl: string,
  pkpPublicKey: string,
  authMethodType: number,
  authMethodId: string,
  accessToken: string,
  domain: string,
): Promise<LitRustPasskeyAuthContextResult> {
  const raw = await assertNativeModule().createAuthContextFromPasskeyCallback(
    network,
    rpcUrl,
    pkpPublicKey,
    authMethodType,
    authMethodId,
    accessToken,
    domain,
  );
  return parseEnvelope<LitRustPasskeyAuthContextResult>(raw);
}

export async function litRustNativeCreatePasskey(
  options: unknown,
): Promise<LitRustNativeCreatePasskeyResult> {
  const raw = await assertNativeModule().nativeCreatePasskey(JSON.stringify(options));
  return parseJson<LitRustNativeCreatePasskeyResult>(raw, 'nativeCreatePasskey');
}

export async function litRustNativeGetPasskey(
  options: unknown,
): Promise<LitRustNativeGetPasskeyResult> {
  const raw = await assertNativeModule().nativeGetPasskey(JSON.stringify(options));
  return parseJson<LitRustNativeGetPasskeyResult>(raw, 'nativeGetPasskey');
}
