import { requireOptionalNativeModule } from 'expo-modules-core';

type Envelope<T> = {
  ok: boolean;
  result?: T;
  error?: string;
};

export type LitRustHealthcheck = {
  bridgeVersion: string;
  litNetworks: string[];
  target: string;
};

export type LitRustConnectResult = {
  network: string;
  connectedNodes: number;
  threshold: number;
  epoch: number;
  firstNode?: string;
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

export type LitRustPaginatedPkpsResult = {
  pkps: Array<{
    tokenId: string;
    pubkey: string;
    ethAddress: string;
  }>;
  pagination: {
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
  };
};

export type LitRustExecuteJsResult = {
  success: boolean;
  signatures: Record<string, unknown>;
  response: unknown;
  logs: string;
};

export type LitRustSignMessageResult = {
  signature: string;
};

export type LitRustFetchAndDecryptContentResult = {
  audioBase64: string;
  bytes: number;
  mimeType?: string;
  sourceUrl: string;
};

export type LitRustNativeCreatePasskeyResult = {
  registrationResponseJson: string;
  credentialPublicKey: string;
};

export type LitRustNativeGetPasskeyResult = {
  authenticationResponseJson: string;
};

type HeavenLitRustNativeModule = {
  healthcheck(): Promise<string>;
  testConnect(network: string, rpcUrl: string): Promise<string>;
  createAuthContextFromPasskeyCallback(
    network: string,
    rpcUrl: string,
    pkpPublicKey: string,
    authMethodType: number,
    authMethodId: string,
    accessToken: string,
    authConfigJson: string,
  ): Promise<string>;
  clearAuthContext(): Promise<string>;
  viewPKPsByAuthData(
    network: string,
    rpcUrl: string,
    authMethodType: number,
    authMethodId: string,
    limit: number,
    offset: number,
  ): Promise<string>;
  executeJs(
    network: string,
    rpcUrl: string,
    code: string,
    ipfsId: string,
    jsParamsJson: string,
    useSingleNode: boolean,
  ): Promise<string>;
  signMessage(
    network: string,
    rpcUrl: string,
    message: string,
    publicKey: string,
  ): Promise<string>;
  fetchAndDecryptContent(
    network: string,
    rpcUrl: string,
    paramsJson: string,
  ): Promise<string>;
  nativeCreatePasskey(optionsJson: string): Promise<string>;
  nativeGetPasskey(optionsJson: string): Promise<string>;
};

const nativeModule = requireOptionalNativeModule<HeavenLitRustNativeModule>('HeavenLitRust');

function assertNativeModule(): HeavenLitRustNativeModule {
  if (!nativeModule) {
    throw new Error(
      'HeavenLitRust native module is not available. Rebuild the dev-client so Expo can autolink ./modules/heaven-lit-rust.',
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

export async function litRustTestConnect(
  network: string,
  rpcUrl: string,
): Promise<LitRustConnectResult> {
  const raw = await assertNativeModule().testConnect(network, rpcUrl);
  return parseEnvelope<LitRustConnectResult>(raw);
}

export async function litRustCreateAuthContextFromPasskeyCallback(
  network: string,
  rpcUrl: string,
  pkpPublicKey: string,
  authMethodType: number,
  authMethodId: string,
  accessToken: string,
  authConfigJson: string,
): Promise<LitRustPasskeyAuthContextResult> {
  const raw = await assertNativeModule().createAuthContextFromPasskeyCallback(
    network,
    rpcUrl,
    pkpPublicKey,
    authMethodType,
    authMethodId,
    accessToken,
    authConfigJson,
  );
  return parseEnvelope<LitRustPasskeyAuthContextResult>(raw);
}

export async function litRustClearAuthContext(): Promise<{ success: boolean }> {
  const raw = await assertNativeModule().clearAuthContext();
  return parseEnvelope<{ success: boolean }>(raw);
}

export async function litRustViewPKPsByAuthData(
  network: string,
  rpcUrl: string,
  authMethodType: number,
  authMethodId: string,
  limit: number,
  offset: number,
): Promise<LitRustPaginatedPkpsResult> {
  const raw = await assertNativeModule().viewPKPsByAuthData(
    network,
    rpcUrl,
    authMethodType,
    authMethodId,
    limit,
    offset,
  );
  return parseEnvelope<LitRustPaginatedPkpsResult>(raw);
}

export async function litRustExecuteJs(
  network: string,
  rpcUrl: string,
  code: string,
  ipfsId: string,
  jsParamsJson: string,
  useSingleNode: boolean,
): Promise<LitRustExecuteJsResult> {
  const raw = await assertNativeModule().executeJs(
    network,
    rpcUrl,
    code,
    ipfsId,
    jsParamsJson,
    useSingleNode,
  );
  return parseEnvelope<LitRustExecuteJsResult>(raw);
}

export async function litRustSignMessage(
  network: string,
  rpcUrl: string,
  message: string,
  publicKey: string,
): Promise<LitRustSignMessageResult> {
  const raw = await assertNativeModule().signMessage(network, rpcUrl, message, publicKey);
  return parseEnvelope<LitRustSignMessageResult>(raw);
}

export async function litRustFetchAndDecryptContent(
  network: string,
  rpcUrl: string,
  paramsJson: string,
): Promise<LitRustFetchAndDecryptContentResult> {
  const raw = await assertNativeModule().fetchAndDecryptContent(network, rpcUrl, paramsJson);
  return parseEnvelope<LitRustFetchAndDecryptContentResult>(raw);
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

