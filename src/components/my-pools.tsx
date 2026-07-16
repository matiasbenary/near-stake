import { yoctoToNear } from 'near-api-js';
import { LiquidPools } from '@/config';
import { Position } from '@/lib/staking';

const MIN_VISIBLE_NEAR = 10n ** 22n; // 0.01 Ⓝ at the displayed precision

export function MyPools({
  positions,
  selected,
  busy,
  liquidBalances,
  liquidNearBalances,
  onSelect,
}: {
  positions: Position[];
  selected: string;
  busy: boolean;
  liquidBalances: Record<string, string>;
  liquidNearBalances: Record<string, string | undefined>;
  onSelect: (id: string) => void;
}) {
  const heldLiquidPools = LiquidPools.filter((pool) => BigInt(liquidBalances[pool.id] ?? '0') > 0n);
  if (positions.length === 0 && heldLiquidPools.length === 0) return null;
  const totalDirectStaked = positions.reduce((s, p) => s + p.staked_balance, 0n);
  const totalLiquidStaked = heldLiquidPools.reduce(
    (sum, pool) => sum + BigInt(liquidNearBalances[pool.id] ?? '0'),
    0n
  );
  const totalStaked = totalDirectStaked + totalLiquidStaked;
  const totalUnstaked = positions.reduce((s, p) => s + p.unstaked_balance, 0n);
  return (
    <section className="card">
      <div className="card-head">
        <h2>My pools</h2>
        <span className="meta">
          {yoctoToNear(totalStaked, 2)} Ⓝ staked
          {totalUnstaked > 0n &&
            ` · ${yoctoToNear(totalUnstaked, 2)} Ⓝ unstaking`}
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
            {p.unstaked_balance >= MIN_VISIBLE_NEAR && (
              <span className="num dim">
                {yoctoToNear(p.unstaked_balance, 2)} Ⓝ{' '}
                {p.can_withdraw ? 'ready to withdraw' : 'unstaking'}
              </span>
            )}
            {p.staked_balance > 0n && (
              <span className="num">{yoctoToNear(p.staked_balance, 2)} Ⓝ</span>
            )}
          </button>
        ))}
        {heldLiquidPools.map((pool) => (
          <button
            key={pool.id}
            className={`vrow${pool.id === selected ? ' active' : ''}`}
            disabled={busy}
            onClick={() => onSelect(pool.id)}
          >
            <span className="grow">{pool.id}</span>
            <span className="num">
              {yoctoToNear(BigInt(liquidBalances[pool.id]), 2)} {pool.token}
              {liquidNearBalances[pool.id] &&
                ` (${yoctoToNear(BigInt(liquidNearBalances[pool.id]!), 2)} Ⓝ)`}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
