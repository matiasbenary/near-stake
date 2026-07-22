'use client';
import { useState } from 'react';
import { parseNearAmount, yoctoToNear } from 'near-api-js';
import { LiquidPools } from '@/config';
import { StakingAction, useStakingAction } from '@/hooks/use-staking';
import {
  apyLabel,
  errMsg,
  formatNearBalance,
  formatTokenBalance,
  GAS_RESERVE,
  PoolAccount,
} from '@/lib/staking';

function AmountInput({
  amount,
  setAmount,
  maxAmount,
  unit,
  busy,
  ariaLabel,
  overMax = false,
  disabled = false,
}: {
  amount: string;
  setAmount: (amount: string) => void;
  maxAmount: string;
  unit: string;
  busy: boolean;
  ariaLabel: string;
  overMax?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className={`amount${overMax ? ' over' : ''}`}>
      <input
        type="number"
        min="0"
        placeholder="0.0"
        value={amount}
        onChange={(event) => setAmount(event.target.value)}
        aria-label={ariaLabel}
      />
      <button className="max" disabled={busy || disabled} onClick={() => setAmount(maxAmount)}>
        MAX
      </button>
      <span className="unit">{unit}</span>
    </div>
  );
}

export function PoolCard({
  poolId,
  account,
  balance,
  fee,
  baseApy,
  liquidBalance,
  busy,
}: {
  poolId: string;
  account: PoolAccount | null;
  balance: string | null;
  fee: number | undefined;
  baseApy: number | null;
  liquidBalance: string | undefined;
  busy: boolean;
}) {
  const [mode, setMode] = useState<'stake' | 'unstake' | 'fast' | 'withdraw'>('stake');
  const [amount, setAmount] = useState('');
  const [success, setSuccess] = useState('');
  const action = useStakingAction(poolId);
  const isBusy = busy || action.isPending;

  const act = async (nextAction: StakingAction, okMsg: string) => {
    action.reset();
    setSuccess('');
    try {
      await action.mutateAsync(nextAction);
      setAmount('');
      setSuccess(okMsg);
    } catch {
      // The mutation exposes the error for rendering below.
    }
  };

  const metaFastUnstake = async () => {
    const stnearToBurn = parseNearAmount(amount as `${number}`);
    if (!stnearToBurn) return;

    await act(
      { type: 'fastUnstake', amount: stnearToBurn },
      `✓ Fast-unstaked ${amount} stNEAR`
    );
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
  const maxAmount = yoctoToNear(availYocto).replace(/,/g, '');
  const overMax = amount !== '' && Number(amount) > Number(maxAmount);
  const liquidPool = LiquidPools.find((pool) => pool.id === poolId);
  const isMetaPool = liquidPool?.fastExit?.type === 'metapool';
  const externalFastExit =
    liquidPool?.fastExit?.type === 'external' ? liquidPool.fastExit : undefined;
  const modes: { id: typeof mode; label: string }[] = [
    { id: 'stake', label: 'Stake' },
    { id: 'unstake', label: 'Unstake' },
    ...(liquidPool?.fastExit ? [{ id: 'fast' as const, label: 'Fast Unstake' }] : []),
    { id: 'withdraw', label: 'Withdraw' },
  ];

  return (
    <div className="card">
      <h2>{poolId}</h2>
      <p className="meta">
        {liquidPool ? (
          `Estimated APY ${apyLabel(baseApy, fee)}`
        ) : baseApy !== null && fee !== undefined ? (
          <>
            APY {baseApy.toFixed(1)}% · fee {(fee * 100).toFixed(1)}% ·{' '}
            <span className="net">net {apyLabel(baseApy, fee)}</span>
          </>
        ) : (
          `APY ${apyLabel(baseApy, fee)}`
        )}
      </p>
      <div className="pool-balances">
        {liquidPool && liquidBalance !== undefined ? (
          <div className="kv">
            <span>Staked here</span>
            <span>
              {formatTokenBalance(BigInt(liquidBalance), liquidPool.token)}
              {account &&
                BigInt(account.staked_balance) > 0n &&
                ` (${formatNearBalance(BigInt(account.staked_balance))})`}
            </span>
          </div>
        ) : (
          <div className="kv">
            <span>Staked here</span>
            <span>
              {account ? formatNearBalance(BigInt(account.staked_balance)) : '—'}
            </span>
          </div>
        )}
        <div className="kv">
          <span>Unstaked here</span>
          <span>
              {account ? formatNearBalance(BigInt(account.unstaked_balance)) : '—'}
          </span>
        </div>
      </div>
      <div className="modes">
        {modes.map((m) => (
          <button
            key={m.id}
            className={mode === m.id ? 'active' : ''}
            disabled={isBusy}
            onClick={() => {
              setMode(m.id);
              setAmount('');
              action.reset();
              setSuccess('');
            }}
          >
            {m.label}
          </button>
        ))}
      </div>
      {mode === 'fast' && isMetaPool ? (
        <>
          <AmountInput
            amount={amount}
            setAmount={setAmount}
            maxAmount={liquidBalance ? yoctoToNear(BigInt(liquidBalance)).replace(/,/g, '') : ''}
            unit={liquidPool.token}
            busy={isBusy}
            disabled={!liquidBalance}
            ariaLabel="stNEAR amount to fast unstake"
          />
          <p className="avail">
            {liquidBalance
              ? `Available ${yoctoToNear(BigInt(liquidBalance), 2)} stNEAR`
              : 'Loading stNEAR balance…'}
          </p>
          <p className="avail">
            Fast exit uses Meta Pool liquidity. A 5% minimum-output protection is applied;
            the live fee can be lower.
          </p>
          <button
            className="btn btn-block"
            disabled={isBusy || !amount || Number(amount) <= 0 || !liquidBalance}
            onClick={metaFastUnstake}
          >
            {isBusy ? 'Confirm in wallet…' : 'Fast Unstake'}
          </button>
        </>
      ) : mode === 'fast' && externalFastExit ? (
        <>
          <p className="avail">
            Receive NEAR immediately by swapping your liquid-staking token. The provider will
            show the live quote, fee, and slippage before you approve.
          </p>
          <a className="btn btn-block" href={externalFastExit.url} target="_blank" rel="noreferrer">
            Fast Unstake on {externalFastExit.label}
          </a>
        </>
      ) : mode !== 'withdraw' ? (
        <>
          <AmountInput
            amount={amount}
            setAmount={setAmount}
            maxAmount={maxAmount}
            unit="NEAR"
            busy={isBusy}
            overMax={overMax}
            ariaLabel="Amount"
          />
          <p className={`avail${overMax ? ' error' : ''}`}>
            {overMax
              ? `Exceeds available ${yoctoToNear(availYocto, 2)} Ⓝ`
              : `Available ${yoctoToNear(availYocto, 2)} Ⓝ`}
          </p>
          <button
            className="btn btn-block"
            disabled={isBusy || !amount || Number(amount) <= 0 || overMax}
            onClick={() =>
              mode === 'stake'
                ? act(
                    {
                      type: 'stake',
                      amount: parseNearAmount(amount as `${number}`) ?? '0',
                    },
                    `✓ Staked ${amount} Ⓝ`
                  )
                : amount === maxAmount
                ? act(
                    { type: 'unstake' },
                    `✓ Unstaked ${amount} Ⓝ — unlocks in ~2 days`
                  )
                : act(
                    {
                      type: 'unstake',
                      amount: parseNearAmount(amount as `${number}`) ?? '0',
                    },
                    `✓ Unstaked ${amount} Ⓝ — unlocks in ~2 days`
                  )
            }
          >
            {isBusy ? 'Confirm in wallet…' : mode === 'stake' ? 'Stake' : 'Unstake'}
          </button>
        </>
      ) : (
        <>
          <p className="avail">
            {!account || BigInt(account.unstaked_balance) === 0n
              ? 'Nothing to withdraw.'
              : canWithdraw
              ? `${yoctoToNear(BigInt(account.unstaked_balance), 2)} Ⓝ ready to withdraw.`
              : `${yoctoToNear(
                  BigInt(account.unstaked_balance),
                  2
                )} Ⓝ unlocking — available ~2 days (4 epochs) after you unstaked.`}
          </p>
          <button
            className="btn btn-block"
            disabled={isBusy || !canWithdraw}
            onClick={() =>
              act(
                { type: 'withdraw' },
                `✓ Withdrew ${yoctoToNear(BigInt(account?.unstaked_balance ?? '0'), 2)} Ⓝ`
              )
            }
          >
            {isBusy ? 'Confirm in wallet…' : 'Withdraw all'}
          </button>
        </>
      )}
      {action.error && <p className="hint error">{errMsg(action.error)}</p>}
      {success && <p className="hint ok">{success}</p>}
      <p className="hint">
        {mode === 'stake'
          ? liquidPool
            ? 'Liquid pool: you receive a token representing your stake — tradable, no unlock period to exit.'
            : 'Rewards accrue every epoch (~12 h) and compound automatically.'
          : mode === 'unstake'
          ? 'Unstaked funds unlock after 4 epochs (~2 days), then withdraw them.'
          : mode === 'fast'
          ? 'Immediately unstake tokens, will incur in a fee.'
          : 'Withdrawing moves unlocked funds back to your wallet.'}
      </p>
    </div>
  );
}
