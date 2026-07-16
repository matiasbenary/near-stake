import { NetworkId } from '@/config';
import { nearToYocto, teraToGas, yoctoToNear } from 'near-api-js';

export const GAS = teraToGas('300'); // 300 Tgas — Meta Pool needs more than the 30 Tgas default
export const GAS_RESERVE = nearToYocto(0.1); // keep 0.1 Ⓝ in the wallet for gas
export const MIN_DISPLAY_NEAR = 10n ** 22n; // 0.01 Ⓝ at the displayed precision
export const FASTNEAR =
  NetworkId === 'mainnet' ? 'https://api.fastnear.com' : 'https://test.api.fastnear.com';
const NEARBLOCKS =
  NetworkId === 'mainnet' ? 'https://api.nearblocks.io' : 'https://api-testnet.nearblocks.io';

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

// ponytail: module-level cache — NearBlocks free tier allows ~6 req/min and React
// StrictMode double-mounts effects in dev, so fetch the validator list once per load
let cache: Promise<ValidatorData> | null = null;

// Only share requests while they are running. This prevents React StrictMode (and
// concurrent consumers) from sending the same RPC query twice, without caching
// account balances after a staking transaction.
const inFlight = new Map<string, Promise<unknown>>();

export function dedupeInFlight<T>(key: string, request: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key);
  if (existing) return existing as Promise<T>;

  const pending = request().finally(() => inFlight.delete(key));
  inFlight.set(key, pending);
  return pending;
}

export async function getValidatorData(): Promise<ValidatorData> {
  cache ??= fetchValidatorData();
  const data = await cache;
  if (data.pools.length === 0) cache = null; // don't cache a rate-limited miss; retry next mount
  return data;
}

async function fetchValidatorData(): Promise<ValidatorData> {
  const pools: Validator[] = [];
  const fees: Record<string, number> = {};
  const perPage = 100;
  const firstPage = await fetch(`${NEARBLOCKS}/v1/validators?page=1&per_page=${perPage}`).then(
    (response) => response.json()
  );
  const activeCount = Number(firstPage.currentValidators ?? firstPage.total ?? 0);
  const pageCount = Math.max(1, Math.ceil(activeCount / perPage));
  const remainingPages = await Promise.all(
    Array.from({ length: pageCount - 1 }, (_, index) =>
      fetch(`${NEARBLOCKS}/v1/validators?page=${index + 2}&per_page=${perPage}`).then((response) =>
        response.json()
      )
    )
  );
  const pages = [firstPage, ...remainingPages];
  const apy = Number.isFinite(Number(firstPage.lastEpochApy))
    ? Number(firstPage.lastEpochApy)
    : null;
  const seen = new Set<string>();

  for (const page of pages) {
    for (const v of Array.isArray(page.validatorFullData) ? page.validatorFullData : []) {
      if (!v.currentEpoch || seen.has(v.accountId)) continue; // inactive / kicked / proposal-only
      seen.add(v.accountId);
      const { produced, total } = v.currentEpoch.progress?.blocks ?? {};
      const uptime =
        Number.isFinite(produced) && Number.isFinite(total) && total > 0
          ? (produced / total) * 100
          : undefined;
      const stakePercent = Number(v.percent);
      pools.push({
        id: v.accountId,
        liquid: false,
        uptime,
        stakePercent: Number.isFinite(stakePercent) ? stakePercent : undefined,
      });
      if (v.poolInfo?.fee)
        fees[v.accountId] = v.poolInfo.fee.numerator / v.poolInfo.fee.denominator;
    }
  }

  pools.sort((a, b) => apyNum(apy, fees[b.id]) - apyNum(apy, fees[a.id]));
  return { pools, fees, apy };
}
