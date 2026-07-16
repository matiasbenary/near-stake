'use client';
import { useMemo, useState } from 'react';
import { formatNearAmount } from '@near-js/utils';
import { apyLabel, apyNum, Position, Validator } from '@/lib/staking';

type Filter = 'all' | 'liquid' | 'mine';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'liquid', label: 'Liquid' },
  { key: 'mine', label: 'My pools' },
];

export function ValidatorList({
  validators,
  positions,
  selected,
  busy,
  baseApy,
  fees,
  onSelect,
}: {
  validators: Validator[];
  positions: Position[];
  selected: string;
  busy: boolean;
  baseApy: number | null;
  fees: Record<string, number>;
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sortApy, setSortApy] = useState(false);

  const mine = useMemo(() => new Set(positions.map((p) => p.id)), [positions]);
  const shown = validators.filter(
    (v) =>
      v.id.includes(query.trim().toLowerCase()) &&
      (filter === 'all' || (filter === 'liquid' ? v.liquid : mine.has(v.id)))
  );
  if (sortApy)
    shown.sort((a, b) => apyNum(baseApy, fees[b.id]) - apyNum(baseApy, fees[a.id]));

  return (
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
            onClick={() => onSelect(v.id)}
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
            <span className="num">{apyLabel(baseApy, fees[v.id])} APY</span>
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
  );
}
