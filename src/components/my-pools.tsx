import { formatNearAmount } from '@near-js/utils';
import { Position, usd } from '@/lib/staking';

export function MyPools({
  positions,
  selected,
  busy,
  price,
  onSelect,
}: {
  positions: Position[];
  selected: string;
  busy: boolean;
  price: number | null;
  onSelect: (id: string) => void;
}) {
  if (positions.length === 0) return null;
  const totalStaked = positions.reduce((s, p) => s + BigInt(p.staked_balance), 0n);
  const totalUnstaked = positions.reduce((s, p) => s + BigInt(p.unstaked_balance), 0n);
  return (
    <section className="card">
      <div className="card-head">
        <h2>My pools</h2>
        <span className="meta">
          {formatNearAmount(totalStaked.toString(), 2)} Ⓝ staked
          {usd(totalStaked.toString(), price)}
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
            onClick={() => onSelect(p.id)}
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
  );
}
