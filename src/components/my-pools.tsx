import { LiquidPools } from '@/config';
import {
  formatNearBalance,
  formatTokenBalance,
  PoolAccount,
  Position,
} from '@/lib/staking';

export function MyPools({
  positions,
  selected,
  busy,
  liquidBalances,
  liquidAccounts,
  onSelect,
}: {
  positions: Position[];
  selected: string;
  busy: boolean;
  liquidBalances: Record<string, string>;
  liquidAccounts: Record<string, PoolAccount | undefined>;
  onSelect: (id: string) => void;
}) {
  const activeLiquidPools = LiquidPools.filter((pool) => {
    const tokenBalance = BigInt(liquidBalances[pool.id] ?? '0');
    const unstakedBalance = BigInt(liquidAccounts[pool.id]?.unstaked_balance ?? '0');
    return tokenBalance > 0n || unstakedBalance > 0n;
  });
  if (positions.length === 0 && activeLiquidPools.length === 0) return null;
  const totalDirectStaked = positions.reduce((s, p) => s + p.staked_balance, 0n);
  const totalLiquidStaked = activeLiquidPools.reduce(
    (sum, pool) => sum + BigInt(liquidAccounts[pool.id]?.staked_balance ?? '0'),
    0n
  );
  const totalStaked = totalDirectStaked + totalLiquidStaked;
  const totalDirectUnstaked = positions.reduce((s, p) => s + p.unstaked_balance, 0n);
  const totalLiquidUnstaked = activeLiquidPools.reduce(
    (sum, pool) => sum + BigInt(liquidAccounts[pool.id]?.unstaked_balance ?? '0'),
    0n
  );
  const totalUnstaked = totalDirectUnstaked + totalLiquidUnstaked;
  return (
    <section className="card">
      <div className="card-head">
        <h2>My Staking</h2>
        <span className="meta">
          {formatNearBalance(totalStaked)} staked
          {totalUnstaked > 0n &&
            ` · ${formatNearBalance(totalUnstaked)} unstaking`}
        </span>
      </div>
      <div className="vlist">
        {positions.map((p) => (
          <button
            key={p.id}
            className={`vrow${p.id === selected ? ' active' : ''}`}
            disabled={busy}
            onClick={() => onSelect(p.id)}
          >
            <span className="grow">{p.id}</span>
            {p.unstaked_balance > 0n && (
              <span className="num dim">
                {formatNearBalance(p.unstaked_balance)}{' '}
                {p.can_withdraw ? 'ready to withdraw' : 'unstaking'}
              </span>
            )}
            {p.staked_balance > 0n && (
              <span className="num">{formatNearBalance(p.staked_balance)}</span>
            )}
          </button>
        ))}
        {activeLiquidPools.map((pool) => {
          const tokenBalance = BigInt(liquidBalances[pool.id] ?? '0');
          const account = liquidAccounts[pool.id];
          const nearBalance = BigInt(account?.staked_balance ?? '0');
          const unstakedBalance = BigInt(account?.unstaked_balance ?? '0');
          return (
            <button
              key={pool.id}
              className={`vrow${pool.id === selected ? ' active' : ''}`}
              disabled={busy}
              onClick={() => onSelect(pool.id)}
            >
              <span className="grow">{pool.id}</span>
              {unstakedBalance > 0n && (
                <span className="num dim">
                  {formatNearBalance(unstakedBalance)}{' '}
                  {account?.can_withdraw ? 'ready to withdraw' : 'unstaking'}
                </span>
              )}
              {tokenBalance > 0n && (
                <span className="num">
                  {formatTokenBalance(tokenBalance, pool.token)}
                  {nearBalance > 0n && ` (${formatNearBalance(nearBalance)})`}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
