import { NetworkId } from '@/config';

export const GAS = '300000000000000'; // 300 Tgas — Meta Pool needs more than the 30 Tgas default
export const GAS_RESERVE = 100000000000000000000000n; // keep 0.1 Ⓝ in the wallet for gas
export const FASTNEAR =
  NetworkId === 'mainnet' ? 'https://api.fastnear.com' : 'https://test.api.fastnear.com';
const NEARBLOCKS =
  NetworkId === 'mainnet' ? 'https://api.nearblocks.io' : 'https://api-testnet.nearblocks.io';

export type Validator = { id: string; stake: string; liquid: boolean };
export type PoolAccount = {
  staked_balance: string;
  unstaked_balance: string;
  can_withdraw: boolean;
};
export type Position = PoolAccount & { id: string };
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

export const usd = (yocto: string, price: number | null) =>
  price === null
    ? ''
    : ` ≈ $${((Number(yocto) / 1e24) * price).toLocaleString('en-US', {
        maximumFractionDigits: 2,
      })}`;

export const apyNum = (baseApy: number | null, fee: number | undefined) =>
  baseApy !== null && fee !== undefined ? baseApy * (1 - fee) : -1;

export const apyLabel = (baseApy: number | null, fee: number | undefined) => {
  const n = apyNum(baseApy, fee);
  return n >= 0 ? `${n.toFixed(1)}%` : '—';
};

// ponytail: module-level cache — NearBlocks free tier allows ~6 req/min and React
// StrictMode double-mounts effects in dev, so fetch the ~5 pages exactly once per load
let cache: Promise<ValidatorData> | null = null;

export async function getValidatorData(): Promise<ValidatorData> {
  cache ??= fetchValidatorData();
  const data = await cache;
  if (data.pools.length === 0) cache = null; // don't cache a rate-limited miss; retry next mount
  return data;
}

async function fetchValidatorData(): Promise<ValidatorData> {
  const pools: Validator[] = [];
  const fees: Record<string, number> = {};
  let apy: number | null = null;
  for (let page = 1; page <= 8; page++) {
    const d = await fetch(`${NEARBLOCKS}/v1/validators?page=${page}&per_page=100`).then((r) =>
      r.json()
    );
    if (!Array.isArray(d.validatorFullData)) break; // rate-limited — keep what we have
    if (apy === null && Number.isFinite(Number(d.lastEpochApy))) apy = Number(d.lastEpochApy);
    for (const v of d.validatorFullData) {
      if (!v.currentEpoch) continue; // inactive / kicked / proposal-only
      pools.push({ id: v.accountId, stake: v.currentEpoch.stake, liquid: false });
      if (v.poolInfo?.fee)
        fees[v.accountId] = v.poolInfo.fee.numerator / v.poolInfo.fee.denominator;
    }
    if (page * 100 >= d.total) break;
  }
  pools.sort((a, b) => (BigInt(a.stake) < BigInt(b.stake) ? 1 : -1));
  return { pools, fees, apy };
}
