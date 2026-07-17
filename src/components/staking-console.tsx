'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNearWallet } from 'near-connect-hooks';
import { yoctoToNear } from 'near-api-js';
import { LiquidPools } from '@/config';
import {
  errMsg,
  dedupeInFlight,
  getValidatorData,
  FASTNEAR,
  Fee,
  PoolAccount,
  Position,
  Validator,
} from '@/lib/staking';
import { MyPools } from './my-pools';
import { ValidatorList } from './validator-list';
import { PoolCard } from './pool-card';

export function StakingConsole() {
  const { signedAccountId, provider, viewFunction, getBalance } = useNearWallet();

  const [validators, setValidators] = useState<Validator[]>([]);
  const [selected, setSelected] = useState(LiquidPools[0].id);
  const [balance, setBalance] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [validatorError, setValidatorError] = useState('');
  const [fees, setFees] = useState<Record<string, number>>({});
  const [baseApy, setBaseApy] = useState<number | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [liquidBalances, setLiquidBalances] = useState<Record<string, string>>({});
  const [knownAccounts, setKnownAccounts] = useState<Record<string, PoolAccount>>({});
  const [positionsReady, setPositionsReady] = useState(false);
  const selectionInitialized = useRef(false);
  const account = knownAccounts[selected] ?? null;

  const selectPool = useCallback((poolId: string) => {
    selectionInitialized.current = true;
    setSelected(poolId);
  }, []);

  useEffect(() => {
    selectionInitialized.current = false;
  }, [signedAccountId]);

  const loadPoolAccount = useCallback(
    (poolId: string) =>
      dedupeInFlight(
        `pool-account:${signedAccountId}:${poolId}`,
        () =>
          viewFunction({
            contractId: poolId,
            method: 'get_account',
            args: { account_id: signedAccountId },
          }) as Promise<PoolAccount>
      ),
    [signedAccountId, viewFunction]
  );

  const loadValidators = useCallback(async () => {
    setValidatorError('');
    try {
      let { pools, fees: feeMap, apy } = await getValidatorData();
      if (pools.length === 0) {
        // fallback: plain RPC list — no fees/APY, but the console stays usable
        const { current_validators } = await provider.viewValidators();
        pools = current_validators
          .filter((v) => v.account_id.includes('.pool'))
          .sort((a, b) => (BigInt(a.stake) < BigInt(b.stake) ? 1 : -1))
          .map((v) => ({ id: v.account_id, liquid: false }));
      }
      setValidators([
        ...LiquidPools.map((p) => ({ id: p.id, liquid: true })),
        ...pools,
      ]);
      setFees((prev) => ({ ...feeMap, ...prev }));
      setBaseApy(apy);
    } catch (e) {
      setValidatorError(errMsg(e));
    }
  }, [provider]);

  useEffect(() => {
    loadValidators();
  }, [loadValidators]);

  useEffect(() => {
    // Liquid pools aren't validators, so their fees need two separate contract views.
    LiquidPools.forEach((p) =>
      dedupeInFlight(
        `fee:${p.id}`,
        () =>
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

  const loadPoolAccounts = useCallback(async () => {
    // FastNEAR tells us which pools to inspect, but not the per-pool balances.
    // Query the selected pool and every held pool once each; the selected pool
    // may already be held, so use a Set to avoid a duplicate RPC call.
    let pools: { pool_id: string }[] = [];
    try {
      const data = await dedupeInFlight(
        `staking-pools:${signedAccountId}`,
        () =>
          fetch(`${FASTNEAR}/v1/account/${signedAccountId}/staking`).then((r) => r.json())
      ) as { pools?: { pool_id: string }[] };
      pools = data.pools ?? [];
    } catch {
      setPositions([]);
    }

    const poolIds = [
      ...new Set([selected, ...pools.map((p) => p.pool_id), ...LiquidPools.map((p) => p.id)]),
    ];
    const liquidBalanceResultsPromise = Promise.allSettled(
      LiquidPools.map((pool) =>
        dedupeInFlight(
          `liquid-balance:${signedAccountId}:${pool.id}`,
          () =>
            viewFunction({
              contractId: pool.id,
              method: 'ft_balance_of',
              args: { account_id: signedAccountId },
            }) as Promise<string>
        )
      )
    );
    const poolAccountResultsPromise = Promise.allSettled(
      poolIds.map((poolId) =>
        loadPoolAccount(poolId).then((account) => ({ id: poolId, account }))
      )
    );
    const [liquidBalanceResults, results] = await Promise.all([
      liquidBalanceResultsPromise,
      poolAccountResultsPromise,
    ]);
    const nextLiquidBalances = Object.fromEntries(
      liquidBalanceResults.flatMap((result, index) =>
        result.status === 'fulfilled' ? [[LiquidPools[index].id, result.value]] : []
      )
    );
    setLiquidBalances(nextLiquidBalances);
    const accounts = new Map(
      results
        .filter(
          (r): r is PromiseFulfilledResult<{ id: string; account: PoolAccount }> =>
            r.status === 'fulfilled'
        )
        .map((r) => [r.value.id, r.value.account])
    );

    setKnownAccounts(Object.fromEntries(accounts));
    const nextPositions = pools
      .map((p): Position | null => {
        const account = accounts.get(p.pool_id);
        if (!account) return null;
        return {
          id: p.pool_id,
          staked_balance: BigInt(account.staked_balance),
          unstaked_balance: BigInt(account.unstaked_balance),
          can_withdraw: account.can_withdraw,
        };
      })
      .filter((p): p is Position => !!p)
      .filter((p) => p.staked_balance > 0n || p.unstaked_balance > 0n);
    setPositions(nextPositions);

    if (!selectionInitialized.current) {
      const heldLiquidPool = LiquidPools.find(
        (pool) => BigInt(nextLiquidBalances[pool.id] ?? '0') > 0n
      );
      setSelected(nextPositions[0]?.id ?? heldLiquidPool?.id ?? LiquidPools[0].id);
      selectionInitialized.current = true;
    }
    setPositionsReady(true);
  }, [selected, signedAccountId, viewFunction, loadPoolAccount]);

  const refresh = useCallback(() => {
    setPositionsReady(false);
    dedupeInFlight(`wallet-balance:${signedAccountId}`, () => getBalance(signedAccountId))
      .then((b) => setBalance(b.toString()))
      .catch(() => setBalance(null));
    loadPoolAccounts()
      .catch((e) => setLoadError(errMsg(e)));
  }, [signedAccountId, getBalance, loadPoolAccounts]);

  // A pool switch only needs the selected account. Do not re-fetch the wallet
  // balance and every position on each click.
  useEffect(() => {
    if (!positionsReady) return;
    if (knownAccounts[selected]) return;
    loadPoolAccount(selected)
      .then((account) => setKnownAccounts((accounts) => ({ ...accounts, [selected]: account })))
      .catch((e) => setLoadError(errMsg(e)));
  }, [positionsReady, knownAccounts, selected, loadPoolAccount]);

  useEffect(() => {
    refresh();
  }, [signedAccountId]); // refresh is intentionally reserved for sign-in and transactions

  return (
    <div className="stack">
      {loadError && <p className="hint error">{loadError}</p>}
      <MyPools
        positions={positions}
        selected={selected}
        busy={busy}
        liquidBalances={liquidBalances}
        liquidNearBalances={Object.fromEntries(
          LiquidPools.map((pool) => [pool.id, knownAccounts[pool.id]?.staked_balance])
        )}
        onSelect={selectPool}
      />
      <section className="console">
        <ValidatorList
          validators={validators}
          selected={selected}
          busy={busy}
          baseApy={baseApy}
          fees={fees}
          error={validatorError}
          onRetry={loadValidators}
          onSelect={selectPool}
        />
        <div className="side">
          <div className="card">
            <div className="kv">
              <span>Wallet Balance</span>
              <span>
                {balance ? `${yoctoToNear(BigInt(balance), 2)} Ⓝ` : '—'}
              </span>
            </div>
          </div>
          {/* ponytail: key remounts the card on pool switch — resets mode/amount/messages for free */}
          <PoolCard
            key={selected}
            poolId={selected}
            account={account}
            balance={balance}
            fee={fees[selected]}
            baseApy={baseApy}
            liquidBalance={liquidBalances[selected]}
            busy={busy}
            setBusy={setBusy}
            refresh={refresh}
          />
        </div>
      </section>
    </div>
  );
}
