'use client';
import { useMemo, useState } from 'react';
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
} from '@tanstack/react-table';
import { apyLabel, apyNum, Validator } from '@/lib/staking';

type Props = {
  validators: Validator[];
  selected: string;
  busy: boolean;
  baseApy: number | null;
  fees: Record<string, number>;
  onSelect: (id: string) => void;
};

const unavailable = 'n/a';

export function ValidatorList({
  validators,
  selected,
  busy,
  baseApy,
  fees,
  onSelect,
}: Props) {
  const [sorting, setSorting] = useState<SortingState>([{ id: 'apy', desc: true }]);
  const liquidValidators = useMemo(() => validators.filter((validator) => validator.liquid), [validators]);
  const directValidators = useMemo(
    () =>
      validators.filter(
        (validator) =>
          !validator.liquid &&
          validator.uptime !== undefined &&
          apyNum(baseApy, fees[validator.id]) > 0
      ),
    [validators, baseApy, fees]
  );

  const columns = useMemo<ColumnDef<Validator>[]>(
    () => [
      { id: 'pool', accessorFn: (validator) => validator.id, header: 'Pool' },
      {
        id: 'apy',
        accessorFn: (validator) => apyNum(baseApy, fees[validator.id]),
        header: 'Net APY',
      },
      { id: 'uptime', accessorFn: (validator) => validator.uptime ?? -1, header: 'Uptime' },
      {
        id: 'stakePercent',
        accessorFn: (validator) => validator.stakePercent ?? -1,
        header: 'Stake %',
      },
      { id: 'fee', accessorFn: (validator) => fees[validator.id] ?? -1, header: 'Fee' },
    ],
    [baseApy, fees]
  );

  const table = useReactTable({
    data: directValidators,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const renderRow = (validator: Validator) => (
    <tr key={validator.id} className={validator.id === selected ? 'active' : ''}>
      <td>
        <button
          className="validator-name"
          disabled={busy}
          onClick={() => onSelect(validator.id)}
        >
          {validator.id}
          {validator.liquid && <span className="badge">Liquid</span>}
        </button>
      </td>
      <td>{apyLabel(baseApy, fees[validator.id])}</td>
      <td>{validator.uptime !== undefined ? `${validator.uptime.toFixed(1)}%` : unavailable}</td>
      <td>{validator.stakePercent !== undefined ? `${validator.stakePercent.toFixed(2)}%` : unavailable}</td>
      <td>{fees[validator.id] !== undefined ? `${(fees[validator.id] * 100).toFixed(1)}%` : unavailable}</td>
    </tr>
  );

  return (
    <div className="card validator-card">
      {liquidValidators.length > 0 && (
        <section className="liquid-pools-section">
          <h2>Liquid Staking</h2>
          <div className="liquid-pools" aria-label="Liquid pools">
            {liquidValidators.map((validator) => (
              <button
                key={validator.id}
                className={`liquid-pool${validator.id === selected ? ' active' : ''}`}
                disabled={busy}
                onClick={() => onSelect(validator.id)}
              >
                <span>
                  {validator.id}
                  <span className="badge">Liquid</span>
                </span>
                <span>{apyLabel(baseApy, fees[validator.id])} APY</span>
              </button>
            ))}
          </div>
        </section>
      )}
      <div className="validator-heading">
        <div>
          <h2>Validators</h2>
        </div>
      </div>
      <div className="validator-table-wrap">
        <table className="validator-table">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th key={header.id} scope="col">
                    <button
                      className="table-sort"
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      <span aria-hidden="true">
                        {header.column.getIsSorted() === 'asc'
                          ? ' ↑'
                          : header.column.getIsSorted() === 'desc'
                            ? ' ↓'
                            : ''}
                      </span>
                    </button>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => renderRow(row.original))}
          </tbody>
        </table>
        {validators.length === 0 && <p className="hint">Loading validators…</p>}
        {validators.length > 0 && directValidators.length === 0 && (
          <p className="hint">No validators with a positive net APY are available.</p>
        )}
      </div>
      <p className="hint">
        Find more information on validators at{' '}
        <a
          className="validator-info-link"
          href="https://nearblocks.io/validators"
          target="_blank"
          rel="noreferrer"
        >
          NearBlocks
        </a>
        .
      </p>
    </div>
  );
}
