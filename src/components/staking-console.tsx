'use client';
import { useCallback, useEffect, useState } from 'react';
import { useNearWallet } from 'near-connect-hooks';
import { formatNearAmount } from '@near-js/utils';
import { LiquidPools } from '@/config';
import {
  errMsg,
  getValidatorData,
  usd,
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
  const [account, setAccount] = useState<PoolAccount | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState('');
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

  useEffect(() => {
    let stale = false;
    (async () => {
      try {
        let { pools, fees: feeMap, apy } = await getValidatorData();
        if (pools.length === 0) {
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
        if (!stale) setLoadError(errMsg(e));
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
      .catch((e) => setLoadError(errMsg(e)));
    loadPositions();
  }, [selected, signedAccountId, viewFunction, getBalance, loadPositions]);

  useEffect(refresh, [refresh]);

  return (
    <div className="stack">
      {loadError && <p className="hint error">{loadError}</p>}
      <MyPools
        positions={positions}
        selected={selected}
        busy={busy}
        price={price}
        onSelect={setSelected}
      />
      <section className="console">
        <ValidatorList
          validators={validators}
          positions={positions}
          selected={selected}
          busy={busy}
          baseApy={baseApy}
          fees={fees}
          onSelect={setSelected}
        />
        <div className="side">
          <div className="card">
            <div className="kv">
              <span>Wallet</span>
              <span>
                {balance ? `${formatNearAmount(balance, 2)} Ⓝ${usd(balance, price)}` : '—'}
              </span>
            </div>
            <div className="kv">
              <span>NEAR / USD</span>
              <span>{price !== null ? `$${price.toFixed(2)}` : '—'}</span>
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
            price={price}
            busy={busy}
            setBusy={setBusy}
            refresh={refresh}
          />
        </div>
      </section>
    </div>
  );
}
