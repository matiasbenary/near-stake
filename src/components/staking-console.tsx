'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNearWallet } from 'near-connect-hooks';
import { LiquidPools, NetworkId } from '@/config';
import { parseNearAmount, formatNearAmount } from '@near-js/utils';

const GAS = '300000000000000'; // 300 Tgas — Meta Pool needs more than the 30 Tgas default
const FASTNEAR =
  NetworkId === 'mainnet' ? 'https://api.fastnear.com' : 'https://test.api.fastnear.com';
const NEARBLOCKS =
  NetworkId === 'mainnet' ? 'https://api.nearblocks.io' : 'https://api-testnet.nearblocks.io';

type Validator = { id: string; stake: string; liquid: boolean };
type PoolAccount = {
  staked_balance: string;
  unstaked_balance: string;
  can_withdraw: boolean;
};
type Position = PoolAccount & { id: string };
type Fee = { numerator: number; denominator: number };
type Filter = 'all' | 'liquid' | 'mine';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'liquid', label: 'Liquid' },
  { key: 'mine', label: 'My pools' },
];

type ValidatorData = { pools: Validator[]; fees: Record<string, number>; apy: number | null };

// ponytail: first line + truncation — RPC errors are multi-line JSON blobs
const errMsg = (e: unknown) => {
  const s = (e instanceof Error ? e.message : String(e)).split('\n')[0];
  return s.length > 160 ? s.slice(0, 160) + '…' : s;
};

// ponytail: module-level cache — NearBlocks free tier allows ~6 req/min and React
// StrictMode double-mounts effects in dev, so fetch the ~5 pages exactly once per load
let validatorsCache: Promise<ValidatorData> | null = null;

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

export function StakingConsole() {
  const { signedAccountId, provider, viewFunction, callFunction, getBalance } = useNearWallet();

  const [validators, setValidators] = useState<Validator[]>([]);
  const [selected, setSelected] = useState(LiquidPools[0].id);
  const [account, setAccount] = useState<PoolAccount | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState<'stake' | 'unstake' | 'withdraw'>('stake');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sortApy, setSortApy] = useState(false);
  const [fees, setFees] = useState<Record<string, number>>({});
  const [baseApy, setBaseApy] = useState<number | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [price, setPrice] = useState<number | null>(null);

  useEffect(() => {
    fetch('https://api.coingecko.com/api/v3/simple/price?ids=near&vs_currencies=usd')
      .then((r) => r.json())
      .then((d) => setPrice(d.near.usd))
      .catch(() => {});
  }, []);

  const usd = (yocto: string) =>
    price === null
      ? ''
      : ` ≈ $${((Number(yocto) / 1e24) * price).toLocaleString('en-US', {
          maximumFractionDigits: 2,
        })}`;

  useEffect(() => {
    let stale = false;
    (async () => {
      try {
        validatorsCache ??= fetchValidatorData();
        let { pools, fees: feeMap, apy } = await validatorsCache;
        if (pools.length === 0) {
          validatorsCache = null; // don't cache a rate-limited miss; retry next mount
          // fallback: plain RPC list — no fees/APY, but the console stays usable
          const { current_validators } = await provider.viewValidators();
          pools = current_validators
            .filter((v) => v.account_id.includes('.pool'))
            .sort((a, b) => (BigInt(a.stake) < BigInt(b.stake) ? 1 : -1))
            .map((v) => ({ id: v.account_id, stake: v.stake, liquid: false }));
        }
        if (stale) return;
        setValidators([
          ...LiquidPools.map((p) => ({ id: p.id, stake: '0', liquid: true })),
          ...pools,
        ]);
        setFees((prev) => ({ ...feeMap, ...prev }));
        setBaseApy(apy);
      } catch (e) {
        if (!stale) setError(errMsg(e));
      }
    })();
    return () => {
      stale = true;
    };
  }, [provider]);

  useEffect(() => {
    // liquid pools aren't validators, NearBlocks doesn't list them — 2 view calls only
    LiquidPools.forEach((p) =>
      (
        viewFunction({
          contractId: p.id,
          method: 'get_reward_fee_fraction',
          args: {},
        }) as Promise<Fee>
      )
        .then((f) =>
          setFees((prev) => ({ ...prev, [p.id]: f.numerator / f.denominator }))
        )
        .catch(() => {})
    );
  }, [viewFunction]);

  const loadPositions = useCallback(() => {
    fetch(`${FASTNEAR}/v1/account/${signedAccountId}/staking`)
      .then((r) => r.json())
      .then(({ pools }: { pools: { pool_id: string }[] }) =>
        Promise.allSettled(
          pools.map((p) =>
            (
              viewFunction({
                contractId: p.pool_id,
                method: 'get_account',
                args: { account_id: signedAccountId },
              }) as Promise<PoolAccount>
            ).then((a) => ({ id: p.pool_id, ...a }))
          )
        )
      )
      .then((results) =>
        setPositions(
          results
            .filter((r): r is PromiseFulfilledResult<Position> => r.status === 'fulfilled')
            .map((r) => r.value)
            .filter(
              (p) => BigInt(p.staked_balance) > 0n || BigInt(p.unstaked_balance) > 0n
            )
        )
      )
      .catch(() => setPositions([]));
  }, [signedAccountId, viewFunction]);

  const refresh = useCallback(() => {
    setAccount(null);
    getBalance(signedAccountId)
      .then((b) => setBalance(b.toString()))
      .catch(() => setBalance(null));
    viewFunction({
      contractId: selected,
      method: 'get_account',
      args: { account_id: signedAccountId },
    })
      .then(setAccount)
      .catch((e) => setError(errMsg(e)));
    loadPositions();
  }, [selected, signedAccountId, viewFunction, getBalance, loadPositions]);

  useEffect(refresh, [refresh]);

  const act = async (method: string, params: Record<string, unknown>, okMsg: string) => {
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      await callFunction({ contractId: selected, method, gas: GAS, ...params });
      setAmount('');
      setSuccess(okMsg);
      refresh();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const apyNum = (id: string) =>
    baseApy !== null && fees[id] !== undefined ? baseApy * (1 - fees[id]) : -1;
  const apy = (id: string) => (apyNum(id) >= 0 ? `${apyNum(id).toFixed(1)}%` : '—');

  const select = (id: string) => {
    setSelected(id);
    setError('');
    setSuccess('');
  };

  const mine = useMemo(() => new Set(positions.map((p) => p.id)), [positions]);
  const shown = validators.filter(
    (v) =>
      v.id.includes(query.trim().toLowerCase()) &&
      (filter === 'all' || (filter === 'liquid' ? v.liquid : mine.has(v.id)))
  );
  if (sortApy) shown.sort((a, b) => apyNum(b.id) - apyNum(a.id));

  const totalStaked = positions.reduce((s, p) => s + BigInt(p.staked_balance), 0n);
  const totalUnstaked = positions.reduce((s, p) => s + BigInt(p.unstaked_balance), 0n);

  const canWithdraw =
    !!account && account.can_withdraw && BigInt(account.unstaked_balance) > 0n;

  const GAS_RESERVE = 100000000000000000000000n; // keep 0.1 Ⓝ in the wallet for gas
  const walletYocto = balance ? BigInt(balance) : 0n;
  const availYocto =
    mode === 'stake'
      ? walletYocto > GAS_RESERVE
        ? walletYocto - GAS_RESERVE
        : 0n
      : BigInt(account?.staked_balance ?? '0');
  const maxAmount = formatNearAmount(availYocto.toString()).replace(/,/g, '');
  const overMax = amount !== '' && Number(amount) > Number(maxAmount);
  const isLiquid = LiquidPools.some((p) => p.id === selected);

  return (
    <div className="stack">
      {positions.length > 0 && (
        <section className="card">
          <div className="card-head">
            <h2>My pools</h2>
            <span className="meta">
              {formatNearAmount(totalStaked.toString(), 2)} Ⓝ staked
              {usd(totalStaked.toString())}
              {totalUnstaked > 0n &&
                ` · ${formatNearAmount(totalUnstaked.toString(), 2)} Ⓝ unstaking`}
            </span>
          </div>
          <div className="vlist">
            {positions.map((p) => (
              <button
                key={p.id}
                className={`vrow${p.id === selected ? ' active' : ''}`}
                disabled={busy}
                onClick={() => select(p.id)}
              >
                <span className="grow">{p.id}</span>
                {BigInt(p.unstaked_balance) > 0n && (
                  <span className="num dim">
                    {formatNearAmount(p.unstaked_balance, 2)} Ⓝ{' '}
                    {p.can_withdraw ? 'ready' : 'unstaking'}
                  </span>
                )}
                <span className="num">{formatNearAmount(p.staked_balance, 2)} Ⓝ</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="console">
        <div className="card">
          <h2>Validators</h2>
          <div className="toolbar">
            <input
              className="search"
              placeholder="Search pools…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {FILTERS.map((f) => (
              <button
                key={f.key}
                className={`chip${filter === f.key ? ' active' : ''}`}
                onClick={() => setFilter(f.key)}
              >
                {f.label}
              </button>
            ))}
            <button
              className={`chip${sortApy ? ' active' : ''}`}
              onClick={() => setSortApy(!sortApy)}
            >
              Top APY
            </button>
          </div>
          <div className="vlist">
            {shown.map((v) => (
              <button
                key={v.id}
                className={`vrow${v.id === selected ? ' active' : ''}`}
                disabled={busy}
                onClick={() => select(v.id)}
              >
                <span className="grow">
                  {v.id}
                  {v.liquid && (
                    <span
                      className="badge"
                      title="Liquid staking — you receive a token you can trade; no 2-day unlock to exit"
                    >
                      Liquid
                    </span>
                  )}
                </span>
                <span className="num">{apy(v.id)} APY</span>
                {!v.liquid && (
                  <span className="num dim">{formatNearAmount(v.stake, 0)} Ⓝ</span>
                )}
              </button>
            ))}
            {validators.length === 0 && <p className="hint">Loading validators…</p>}
            {validators.length > 0 && shown.length === 0 && (
              <p className="hint">No pools match.</p>
            )}
          </div>
        </div>

        <div className="side">
          <div className="card">
            <div className="kv">
              <span>Wallet</span>
              <span>{balance ? `${formatNearAmount(balance, 2)} Ⓝ${usd(balance)}` : '—'}</span>
            </div>
            <div className="kv">
              <span>NEAR / USD</span>
              <span>{price !== null ? `$${price.toFixed(2)}` : '—'}</span>
            </div>
          </div>

          <div className="card">
            <h2>{selected}</h2>
            <p className="meta">
              {baseApy !== null && fees[selected] !== undefined ? (
                <>
                  APY {baseApy.toFixed(1)}% · fee {(fees[selected] * 100).toFixed(1)}% ·{' '}
                  <span className="net">net {apy(selected)}</span>
                </>
              ) : (
                `APY ${apy(selected)}`
              )}
            </p>
            <div className="pool-balances">
              <div className="kv">
                <span>Staked here</span>
                <span>
                  {account
                    ? `${formatNearAmount(account.staked_balance, 2)} Ⓝ${usd(account.staked_balance)}`
                    : '—'}
                </span>
              </div>
              <div className="kv">
                <span>Unstaked here</span>
                <span>
                  {account
                    ? `${formatNearAmount(account.unstaked_balance, 2)} Ⓝ${usd(account.unstaked_balance)}`
                    : '—'}
                </span>
              </div>
            </div>
            <div className="modes">
              {(['stake', 'unstake', 'withdraw'] as const).map((m) => (
                <button
                  key={m}
                  className={mode === m ? 'active' : ''}
                  disabled={busy}
                  onClick={() => {
                    setMode(m);
                    setAmount('');
                    setError('');
                    setSuccess('');
                  }}
                >
                  {m[0].toUpperCase() + m.slice(1)}
                </button>
              ))}
            </div>
            {mode !== 'withdraw' ? (
              <>
                <div className={`amount${overMax ? ' over' : ''}`}>
                  <input
                    type="number"
                    min="0"
                    placeholder="0.0"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    aria-label="Amount"
                  />
                  <button className="max" disabled={busy} onClick={() => setAmount(maxAmount)}>
                    MAX
                  </button>
                  <span className="unit">NEAR</span>
                </div>
                <p className={`avail${overMax ? ' error' : ''}`}>
                  {overMax
                    ? `Exceeds available ${formatNearAmount(availYocto.toString(), 2)} Ⓝ`
                    : `Available ${formatNearAmount(availYocto.toString(), 2)} Ⓝ${
                        amount && price !== null
                          ? ` · you ${mode} ≈ $${(Number(amount) * price).toFixed(2)}`
                          : ''
                      }`}
                </p>
                <button
                  className="btn btn-block"
                  disabled={busy || !amount || Number(amount) <= 0 || overMax}
                  onClick={() =>
                    mode === 'stake'
                      ? act(
                          'deposit_and_stake',
                          { deposit: parseNearAmount(amount)! },
                          `✓ Staked ${amount} Ⓝ`
                        )
                      : amount === maxAmount
                      ? act('unstake_all', {}, `✓ Unstaked ${amount} Ⓝ — unlocks in ~2 days`)
                      : act(
                          'unstake',
                          { args: { amount: parseNearAmount(amount)! } },
                          `✓ Unstaked ${amount} Ⓝ — unlocks in ~2 days`
                        )
                  }
                >
                  {busy ? 'Confirm in wallet…' : mode === 'stake' ? 'Stake' : 'Unstake'}
                </button>
              </>
            ) : (
              <>
                <p className="avail">
                  {!account || BigInt(account.unstaked_balance) === 0n
                    ? 'Nothing to withdraw.'
                    : canWithdraw
                    ? `${formatNearAmount(account.unstaked_balance, 2)} Ⓝ ready to withdraw.`
                    : `${formatNearAmount(
                        account.unstaked_balance,
                        2
                      )} Ⓝ unlocking — available ~2 days (4 epochs) after you unstaked.`}
                </p>
                <button
                  className="btn btn-block"
                  disabled={busy || !canWithdraw}
                  onClick={() =>
                    act(
                      'withdraw_all',
                      {},
                      `✓ Withdrew ${formatNearAmount(account?.unstaked_balance ?? '0', 2)} Ⓝ`
                    )
                  }
                >
                  {busy ? 'Confirm in wallet…' : 'Withdraw all'}
                </button>
              </>
            )}
            {error && <p className="hint error">{error}</p>}
            {success && <p className="hint ok">{success}</p>}
            <p className="hint">
              {mode === 'stake'
                ? isLiquid
                  ? 'Liquid pool: you receive a token representing your stake — tradable, no unlock period to exit.'
                  : 'Rewards accrue every epoch (~12 h) and compound automatically.'
                : mode === 'unstake'
                ? 'Unstaked funds unlock after 4 epochs (~2 days), then withdraw them.'
                : 'Withdrawing moves unlocked funds back to your wallet.'}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
