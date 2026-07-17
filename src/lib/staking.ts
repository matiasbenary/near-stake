import { nearToYocto, teraToGas, yoctoToNear } from 'near-api-js';

export const GAS = teraToGas('300'); // 300 Tgas — Meta Pool needs more than the 30 Tgas default
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

// Share one snapshot request across React StrictMode's development double-mount.
let cache: Promise<ValidatorData> | null = null;
const VALIDATOR_CACHE_KEY = 'near-stake:validators:mainnet:v3';
const VALIDATOR_CACHE_TTL = 60 * 60 * 1000;

function readValidatorCache(): ValidatorData | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = JSON.parse(localStorage.getItem(VALIDATOR_CACHE_KEY) ?? 'null') as {
      savedAt?: number;
      data?: ValidatorData;
    } | null;
    if (
      !stored?.savedAt ||
      Date.now() - stored.savedAt > VALIDATOR_CACHE_TTL ||
      !stored.data ||
      !Array.isArray(stored.data.pools)
    ) {
      localStorage.removeItem(VALIDATOR_CACHE_KEY);
      return null;
    }
    return stored.data;
  } catch {
    localStorage.removeItem(VALIDATOR_CACHE_KEY);
    return null;
  }
}

function writeValidatorCache(data: ValidatorData) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(VALIDATOR_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), data }));
  } catch {
    // The live request remains usable if browser storage is unavailable or full.
  }
}

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
  cache ??= Promise.resolve(readValidatorCache()).then(
    (stored) => stored ?? fetchValidatorData().then((data) => {
      if (data.pools.length > 0) writeValidatorCache(data);
      return data;
    })
  );
  try {
    const data = await cache;
    if (data.pools.length === 0) cache = null; // don't cache a rate-limited miss; retry next mount
    return data;
  } catch (error) {
    cache = null;
    throw error;
  }
}

async function fetchValidatorData(): Promise<ValidatorData> {
  const response = await fetch('./validators.json');
  if (!response.ok) throw new Error(`Validator snapshot request failed (${response.status})`);
  return response.json() as Promise<ValidatorData>;
}
