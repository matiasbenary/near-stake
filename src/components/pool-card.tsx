'use client';
import { useState } from 'react';
import { useNearWallet } from 'near-connect-hooks';
import { parseNearAmount, formatNearAmount } from '@near-js/utils';
import { LiquidPools } from '@/config';
import { apyLabel, errMsg, GAS, GAS_RESERVE, PoolAccount, usd } from '@/lib/staking';

export function PoolCard({
  poolId,
  account,
  balance,
  fee,
  baseApy,
  price,
  busy,
  setBusy,
  refresh,
}: {
  poolId: string;
  account: PoolAccount | null;
  balance: string | null;
  fee: number | undefined;
  baseApy: number | null;
  price: number | null;
  busy: boolean;
  setBusy: (busy: boolean) => void;
  refresh: () => void;
}) {
  const { callFunction } = useNearWallet();
  const [mode, setMode] = useState<'stake' | 'unstake' | 'withdraw'>('stake');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const act = async (method: string, params: Record<string, unknown>, okMsg: string) => {
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      await callFunction({ contractId: poolId, method, gas: GAS, ...params });
      setAmount('');
      setSuccess(okMsg);
      refresh();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const canWithdraw =
    !!account && account.can_withdraw && BigInt(account.unstaked_balance) > 0n;

  const walletYocto = balance ? BigInt(balance) : 0n;
  const availYocto =
    mode === 'stake'
      ? walletYocto > GAS_RESERVE
        ? walletYocto - GAS_RESERVE
        : 0n
      : BigInt(account?.staked_balance ?? '0');
  const maxAmount = formatNearAmount(availYocto.toString()).replace(/,/g, '');
  const overMax = amount !== '' && Number(amount) > Number(maxAmount);
  const isLiquid = LiquidPools.some((p) => p.id === poolId);

  return (
    <div className="card">
      <h2>{poolId}</h2>
      <p className="meta">
        {baseApy !== null && fee !== undefined ? (
          <>
            APY {baseApy.toFixed(1)}% · fee {(fee * 100).toFixed(1)}% ·{' '}
            <span className="net">net {apyLabel(baseApy, fee)}</span>
          </>
        ) : (
          `APY ${apyLabel(baseApy, fee)}`
        )}
      </p>
      <div className="pool-balances">
        <div className="kv">
          <span>Staked here</span>
          <span>
            {account
              ? `${formatNearAmount(account.staked_balance, 2)} Ⓝ${usd(
                  account.staked_balance,
                  price
                )}`
              : '—'}
          </span>
        </div>
        <div className="kv">
          <span>Unstaked here</span>
          <span>
            {account
              ? `${formatNearAmount(account.unstaked_balance, 2)} Ⓝ${usd(
                  account.unstaked_balance,
                  price
                )}`
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
  );
}
