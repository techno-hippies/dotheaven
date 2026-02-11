/**
 * CountryFlag — renders a circular SVG flag for a given ISO 3166-1 alpha-2 country code.
 * Uses react-native-svg-circle-country-flags under the hood.
 *
 * Usage:
 *   <CountryFlag code="US" size={20} />
 */
import React from 'react';
import type { SvgProps } from 'react-native-svg';
import * as Flags from 'react-native-svg-circle-country-flags/src/flags';

type FlagComponent = React.FC<SvgProps>;

/**
 * Map from uppercase ISO 3166-1 alpha-2 code → flag component.
 * Only includes countries from our NATIONALITY_OPTIONS list.
 */
const FLAG_MAP: Record<string, FlagComponent> = {
  AF: Flags.Af, AL: Flags.Al, DZ: Flags.Dz, AR: Flags.Ar, AM: Flags.Am,
  AU: Flags.Au, AT: Flags.At, AZ: Flags.Az, BH: Flags.Bh, BD: Flags.Bd,
  BY: Flags.By, BE: Flags.Be, BO: Flags.Bo, BA: Flags.Ba, BR: Flags.Br,
  BG: Flags.Bg, KH: Flags.Kh, CM: Flags.Cm, CA: Flags.Ca, CL: Flags.Cl,
  CN: Flags.Cn, CO: Flags.Co, CR: Flags.Cr, HR: Flags.Hr, CU: Flags.Cu,
  CY: Flags.Cy, CZ: Flags.Cz, DK: Flags.Dk, DO: Flags.Do, EC: Flags.Ec,
  EG: Flags.Eg, SV: Flags.Sv, EE: Flags.Ee, ET: Flags.Et, FI: Flags.Fi,
  FR: Flags.Fr, GE: Flags.Ge, DE: Flags.De, GH: Flags.Gh, GR: Flags.Gr,
  GT: Flags.Gt, HT: Flags.Ht, HN: Flags.Hn, HK: Flags.Hk, HU: Flags.Hu,
  IS: Flags.Is, IN: Flags.In, ID: Flags.Id, IR: Flags.Ir, IQ: Flags.Iq,
  IE: Flags.Ie, IL: Flags.Il, IT: Flags.It, JM: Flags.Jm, JP: Flags.Jp,
  JO: Flags.Jo, KZ: Flags.Kz, KE: Flags.Ke, KW: Flags.Kw, KG: Flags.Kg,
  LV: Flags.Lv, LB: Flags.Lb, LY: Flags.Ly, LT: Flags.Lt, LU: Flags.Lu,
  MY: Flags.My, MX: Flags.Mx, MD: Flags.Md, MN: Flags.Mn, ME: Flags.Me,
  MA: Flags.Ma, NP: Flags.Np, NL: Flags.Nl, NZ: Flags.Nz, NI: Flags.Ni,
  NG: Flags.Ng, NO: Flags.No, OM: Flags.Om, PK: Flags.Pk, PA: Flags.Pa,
  PY: Flags.Py, PE: Flags.Pe, PH: Flags.Ph, PL: Flags.Pl, PT: Flags.Pt,
  PR: Flags.Pr, QA: Flags.Qa, RO: Flags.Ro, RU: Flags.Ru, SA: Flags.Sa,
  RS: Flags.Rs, SG: Flags.Sg, SK: Flags.Sk, SI: Flags.Si, ZA: Flags.Za,
  KR: Flags.Kr, ES: Flags.Es, LK: Flags.Lk, SE: Flags.Se, CH: Flags.Ch,
  SY: Flags.Sy, TW: Flags.Tw, TJ: Flags.Tj, TZ: Flags.Tz, TH: Flags.Th,
  TN: Flags.Tn, TR: Flags.Tr, TM: Flags.Tm, UG: Flags.Ug, UA: Flags.Ua,
  AE: Flags.Ae, GB: Flags.Gb, US: Flags.Us, UY: Flags.Uy, UZ: Flags.Uz,
  VE: Flags.Ve, VN: Flags.Vn, YE: Flags.Ye, ZM: Flags.Zm, ZW: Flags.Zw,
};

export interface CountryFlagProps {
  /** ISO 3166-1 alpha-2 country code (e.g. "US", "DE") */
  code: string;
  /** Size in pixels (default: 20) */
  size?: number;
}

export const CountryFlag: React.FC<CountryFlagProps> = ({ code, size = 20 }) => {
  const Flag = FLAG_MAP[code.toUpperCase()];
  if (!Flag) return null;
  return <Flag width={size} height={size} />;
};
