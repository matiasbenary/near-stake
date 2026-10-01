'use client';

import { useState } from 'react';
import { parseNearAmount, yoctoToNear } from 'near-api-js';
import { LockupAction, useLockupAction } from '@/hooks/use-lockup';
import type { LockupPosition } from '@/lib/lockup';
import { errMsg, formatNearBalance } from '@/lib/staking';
import { AmountInput } from './amount-input';

type Mode = 'unstake' | 'withdraw' | 'transfer';

export function LockupCard({ position, busy }: { position: LockupPosition; busy: boolean }) {
  const [mode, setMode] = useState<Mode>('unstake');
  const [amount, setAmount] = useState('');
  const [success, setSuccess] = useState('');
  const action = useLockupAction(position);
  const isBusy = busy || action.isPending;
  const staked = BigInt(position.poolAccount?.staked_balance ?? '0');
  const unstaked = BigInt(position.poolAccount?.unstaked_balance ?? '0');
  const canWithdraw = unstaked > 0n && !!position.poolAccount?.can_withdraw;
  const maxAmount = yoctoToNear(staked).replace(/,/g, '');
  let parsedAmount: string | null = null;
  try {
    if (amount) parsedAmount = parseNearAmount(amount as `${number}`);
  } catch {
    // Invalid input stays disabled until corrected.
  }
  const amountYocto = parsedAmount ? BigInt(parsedAmount) : 0n;
  const overMax = amountYocto > staked;

  const act = async (nextAction: LockupAction, message: string) => {
    action.reset();
    setSuccess('');
    try {
      await action.mutateAsync(nextAction);
      setAmount('');
      setSuccess(message);
    } catch {
      // The mutation exposes the error below.
    }
  };

  return (
    <div className="card">
      <h2>Lockup · {position.poolId ?? 'No validator selected'}</h2>
      <p className="meta lockup-id" title={position.id}>{position.id}</p>
      <div className="pool-balances">
        <div className="kv"><span>Staked</span><span>{formatNearBalance(staked)}</span></div>
        <div className="kv"><span>Unstaked at validator</span><span>{formatNearBalance(unstaked)}</span></div>
        <div className="kv"><span>In lockup account</span><span>{formatNearBalance(position.accountBalance)}</span></div>
        <div className="kv"><span>Still locked</span><span>{formatNearBalance(position.lockedBalance)}</span></div>
        <div className="kv"><span>Available to transfer</span><span>{formatNearBalance(position.transfersEnabled ? position.transferableBalance : 0n)}</span></div>
      </div>
      <div className="modes">
        {(['unstake', 'withdraw', 'transfer'] as const).map((nextMode) => (
          <button
            key={nextMode}
            className={mode === nextMode ? 'active' : ''}
            disabled={isBusy}
            onClick={() => {
              setMode(nextMode);
              setAmount('');
              setSuccess('');
              action.reset();
            }}
          >
            {nextMode[0].toUpperCase() + nextMode.slice(1)}
          </button>
        ))}
      </div>
      {mode === 'unstake' ? (
        <>
          <AmountInput
            amount={amount}
            setAmount={setAmount}
            maxAmount={maxAmount}
            unit="NEAR"
            busy={isBusy}
            disabled={staked === 0n}
            overMax={overMax}
            ariaLabel="Amount to unstake from lockup"
          />
          <p className={`avail${overMax ? ' error' : ''}`}>
            {overMax ? 'Exceeds staked balance' : `Available ${formatNearBalance(staked)}`}
          </p>
          <button
            className="btn btn-block"
            disabled={isBusy || amountYocto <= 0n || overMax || staked === 0n}
            onClick={() =>
              void act(
                amountYocto === staked
                  ? { type: 'unstake' }
                  : { type: 'unstake', amount: parsedAmount! },
                `✓ Unstaked ${amount} Ⓝ from the lockup`
              )
            }
          >
            {isBusy ? 'Confirm in wallet…' : 'Unstake'}
          </button>
          <p className="hint">Unstaked NEAR becomes withdrawable after four epochs.</p>
        </>
      ) : mode === 'withdraw' ? (
        <>
          <p className="avail">
            {unstaked === 0n
              ? 'Nothing to withdraw from the validator.'
              : canWithdraw
                ? `${formatNearBalance(unstaked)} ready to withdraw into the lockup account.`
                : `${formatNearBalance(unstaked)} is waiting for the four epoch unstaking period.`}
          </p>
          <button
            className="btn btn-block"
            disabled={isBusy || !canWithdraw}
            onClick={() => void act({ type: 'withdraw' }, `✓ Withdrew ${formatNearBalance(unstaked)} into the lockup`)}
          >
            {isBusy ? 'Confirm in wallet…' : 'Withdraw all to lockup'}
          </button>
          <p className="hint">To move available funds to your wallet, use Transfer after withdrawal.</p>
        </>
      ) : (
        <>
          <p className="avail">
            {position.transfersEnabled
              ? `${formatNearBalance(position.transferableBalance)} can move to ${position.ownerId}.`
              : 'Transfers are disabled in the lockup. Check whether the transfer vote has enabled them.'}
          </p>
          <button
            className="btn btn-block"
            disabled={isBusy || (position.transfersEnabled && position.transferableBalance === 0n)}
            onClick={() =>
              position.transfersEnabled
                ? void act(
                    { type: 'transfer', amount: position.transferableBalance.toString() },
                    `✓ Transferred ${formatNearBalance(position.transferableBalance)} to ${position.ownerId}`
                  )
                : void act({ type: 'checkTransfers' }, '✓ Transfer availability checked')
            }
          >
            {isBusy
              ? 'Confirm in wallet…'
              : position.transfersEnabled
                ? 'Transfer all available'
                : 'Check transfer availability'}
          </button>
          <p className="hint">Locked funds and the contract storage balance remain in the lockup.</p>
        </>
      )}
      {action.error && <p className="hint error">{errMsg(action.error)}</p>}
      {success && <p className="hint ok">{success}</p>}
    </div>
  );
}
