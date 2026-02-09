export const MEGA_RPC = 'https://carrot.megaeth.com/rpc';
export const IPFS_GATEWAY = 'https://heaven.myfilebase.com/ipfs/';
export const PROFILES_ENDPOINT =
  'https://api.goldsky.com/api/public/project_cmjjtjqpvtip401u87vcp20wd/subgraphs/dotheaven-profiles/1.0.0/gn';

export const REGISTRY_V1 = '0x22B618DaBB5aCdC214eeaA1c4C5e2eF6eb4488C2' as const;
export const RECORDS_V1 = '0x80D1b5BBcfaBDFDB5597223133A404Dc5379Baf3' as const;
export const PROFILE_V2 = '0xa31545D33f6d656E62De67fd020A26608d4601E5' as const;
export const FOLLOW_V1 = '0x3F32cF9e70EF69DFFed74Dfe07034cb03cF726cb' as const;
export const HEAVEN_NODE =
  '0x8edf6f47e89d05c0e21320161fda1fd1fabd0081a66c959691ea17102e39fb27' as const;

export const ZERO_HASH =
  '0x0000000000000000000000000000000000000000000000000000000000000000' as const;

const NUM_TO_GENDER: Record<number, string> = {
  1: 'woman',
  2: 'man',
  3: 'non-binary',
  4: 'trans-woman',
  5: 'trans-man',
  6: 'intersex',
  7: 'other',
};

const GENDER_ABBR: Record<string, string> = {
  man: 'M',
  woman: 'F',
  'non-binary': 'NB',
  'trans-woman': 'TW',
  'trans-man': 'TM',
  intersex: 'IX',
  other: 'O',
};

export function toGenderAbbr(genderNum: number): string | undefined {
  const genderKey = NUM_TO_GENDER[genderNum] ?? '';
  return GENDER_ABBR[genderKey];
}

export function bytes2ToCode(hex: string): string | undefined {
  if (!hex || hex === '0x0000') return undefined;
  const n = parseInt(hex, 16);
  if (!n) return undefined;
  const c1 = String.fromCharCode((n >> 8) & 0xff);
  const c2 = String.fromCharCode(n & 0xff);
  return (c1 + c2).toUpperCase();
}

export function resolveIpfsOrHttpUri(uri: string): string | undefined {
  if (!uri) return undefined;
  if (uri.startsWith('ipfs://')) return `${IPFS_GATEWAY}${uri.slice(7)}`;
  if (uri.startsWith('http://') || uri.startsWith('https://')) return uri;
  return undefined;
}
