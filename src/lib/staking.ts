import { nearToYocto, teraToGas, yoctoToNear } from 'near-api-js';

export const GAS = teraToGas('30');
export const GAS_RESERVE = nearToYocto(0.1); // keep 0.1 Ⓝ in the wallet for gas
export const MIN_DISPLAY_NEAR = 10n ** 22n; // 0.01 Ⓝ at the displayed precision
export const FASTNEAR = 'https://api.fastnear.com';

export type Validator = {
  id: string;
  liquid: boolean;
  uptime?: number;
  stakePercent?: number;
};
export type PoolAccount = {
  staked_balance: string;
  unstaked_balance: string;
  can_withdraw: boolean;
};
export type Position = {
  id: string;
  staked_balance: bigint;
  unstaked_balance: bigint;
  can_withdraw: boolean;
};
export type Fee = { numerator: number; denominator: number };
export type ValidatorData = {
  pools: Validator[];
  fees: Record<string, number>;
  apy: number | null;
};

// ponytail: first line + truncation — RPC errors are multi-line JSON blobs
export const errMsg = (e: unknown) => {
  const s = (e instanceof Error ? e.message : String(e)).split('\n')[0];
  return s.length > 160 ? s.slice(0, 160) + '…' : s;
};

export const apyNum = (baseApy: number | null, fee: number | undefined) =>
  baseApy !== null && fee !== undefined ? baseApy * (1 - fee) : -1;

export const apyLabel = (baseApy: number | null, fee: number | undefined) => {
  const n = apyNum(baseApy, fee);
  return n >= 0 ? `${n.toFixed(1)}%` : '—';
};

export const formatNearBalance = (amount: bigint) =>
  amount > 0n && amount < MIN_DISPLAY_NEAR
    ? '< 0.01 Ⓝ'
    : `${yoctoToNear(amount, 2)} Ⓝ`;

export const formatTokenBalance = (amount: bigint, token: string) =>
  amount > 0n && amount < MIN_DISPLAY_NEAR
    ? `< 0.01 ${token}`
    : `${yoctoToNear(amount, 2)} ${token}`;

export async function getValidatorData(): Promise<ValidatorData> {
  const response = await fetch('./validators.json');
  if (!response.ok) throw new Error(`Validator snapshot request failed (${response.status})`);
  return response.json() as Promise<ValidatorData>;
}
