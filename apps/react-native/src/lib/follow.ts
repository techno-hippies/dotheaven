/**
 * Follow service — read follow state + toggle follow/unfollow via Lit Action.
 *
 * Reads: direct RPC to FollowV1 contract (no auth needed).
 * Mutations: AuthProvider.signMessage() for signing + LitBridge for Lit Action execution.
 */

import { createPublicClient, http, parseAbi } from 'viem';
import { MEGA_RPC, FOLLOW_V1 } from './heaven-constants';
import type { LitBridgeApi } from '../services/LitBridgeApi';

const FOLLOW_V1_CID = 'QmPccpeqwyJSHYzY1HGu6Nmp26anouhTT8daHS8Jox9VTx';

const followAbi = parseAbi([
  'function follows(address, address) external view returns (bool)',
]);

let _client: ReturnType<typeof createPublicClient> | null = null;
function getClient() {
  if (!_client) {
    _client = createPublicClient({ transport: http(MEGA_RPC) });
  }
  return _client;
}

/** Check if viewer follows target (direct RPC) */
export async function getFollowState(
  viewer: `0x${string}`,
  target: `0x${string}`,
): Promise<boolean> {
  const client = getClient();
  return client.readContract({
    address: FOLLOW_V1,
    abi: followAbi,
    functionName: 'follows',
    args: [viewer, target],
  });
}

export interface FollowResult {
  success: boolean;
  txHash?: string;
  error?: string;
}

/** Follow or unfollow a target address via Lit Action + sponsor PKP */
export async function toggleFollow(
  targetAddress: string,
  action: 'follow' | 'unfollow',
  signMessage: (message: string) => Promise<string>,
  bridge: LitBridgeApi,
  pkpPublicKey: string,
): Promise<FollowResult> {
  const timestamp = Date.now();
  const nonce = Math.random().toString(36).slice(2);

  // Sign authorization message via AuthProvider's signMessage
  const message = `heaven:follow:${targetAddress}:${action}:${timestamp}:${nonce}`;
  const signature = await signMessage(message);

  // Execute Lit Action via bridge
  const execResult = await bridge.sendRequest('executeLitAction', {
    ipfsId: FOLLOW_V1_CID,
    jsParams: {
      userPkpPublicKey: pkpPublicKey,
      targetAddress,
      action,
      signature,
      timestamp,
      nonce,
    },
  }, 120000);

  const response = JSON.parse(execResult.response as string);
  return {
    success: response.success,
    txHash: response.txHash,
    error: response.error,
  };
}
