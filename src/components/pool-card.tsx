'use client';
import { useState } from 'react';
import { useNearWallet } from 'near-connect-hooks';
import { parseNearAmount, yoctoToNear } from 'near-api-js';
import { LiquidPools, NetworkId } from '@/config';
import { apyLabel, errMsg, GAS, GAS_RESERVE, PoolAccount } from '@/lib/staking';

export function PoolCard({
  poolId,
  account,
  balance,
  fee,
  baseApy,
  liquidBalance,
  busy,
  setBusy,
  refresh,
}: {
  poolId: string;
  account: PoolAccount | null;
  balance: string | null;
  fee: number | undefined;
  baseApy: number | null;
  liquidBalance: string | undefined;
  busy: boolean;
  setBusy: (busy: boolean) => void;
  refresh: () => void;
}) {
  const { callFunction, viewFunction } = useNearWallet();
  const [mode, setMode] = useState<'stake' | 'unstake' | 'fast' | 'withdraw'>('stake');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const act = async (method: string, params: Record<string, unknown>, okMsg: string) => {
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      await callFunction({ contractId: poolId, method, gas: GAS.toString(), ...params });
      setAmount('');
      setSuccess(okMsg);
      refresh();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const metaFastUnstake = async () => {
    const stnearToBurn = parseNearAmount(amount as `${number}`);
    if (!stnearToBurn) return;

    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const stNearPrice = BigInt(
        (await viewFunction({
          contractId: poolId,
          method: 'get_st_near_price',
          args: {},
        })) as string
      );
      // Meta Pool's liquidity fee is currently capped at 3%. A 5% minimum-output
      // buffer prevents execution at materially worse terms than the live price.
      const minExpectedNear = (BigInt(stnearToBurn) * stNearPrice * 95n) / (100n * 10n ** 24n);
      await callFunction({
        contractId: poolId,
        method: 'liquid_unstake',
        gas: GAS.toString(),
        args: {
          stnear_to_burn: stnearToBurn,
          min_expected_near: minExpectedNear.toString(),
        },
      });
      setAmount('');
      setSuccess(`✓ Fast-unstaked ${amount} stNEAR`);
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
  const maxAmount = yoctoToNear(availYocto).replace(/,/g, '');
  const overMax = amount !== '' && Number(amount) > Number(maxAmount);
  const isLiquid = LiquidPools.some((p) => p.id === poolId);
  const liquidToken = LiquidPools.find((p) => p.id === poolId)?.token;
  const isMetaPool = poolId === 'meta-pool.near' || poolId === 'meta-v2.pool.testnet';
  const fastUnstakeUrl =
    NetworkId === 'mainnet'
      ? poolId === 'meta-pool.near'
        ? 'https://main.metapool.app/stake?token=near'
        : poolId === 'linear-protocol.near'
        ? 'https://app.linearprotocol.org/?tab=unstake'
        : null
      : null;
  const modes: { id: typeof mode; label: string }[] = [
    { id: 'stake', label: 'Stake' },
    { id: 'unstake', label: 'Unstake' },
    ...(isMetaPool || fastUnstakeUrl ? [{ id: 'fast' as const, label: 'Fast Unstake' }] : []),
    { id: 'withdraw', label: 'Withdraw' },
  ];

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
        {liquidToken && liquidBalance !== undefined ? (
          <div className="kv">
            <span>Staked here</span>
            <span>
              {yoctoToNear(BigInt(liquidBalance), 2)} {liquidToken}
              {account && ` (${yoctoToNear(BigInt(account.staked_balance), 2)} Ⓝ)`}
            </span>
          </div>
        ) : (
          <div className="kv">
            <span>Staked here</span>
            <span>
              {account ? `${yoctoToNear(BigInt(account.staked_balance), 2)} Ⓝ` : '—'}
            </span>
          </div>
        )}
        <div className="kv">
          <span>Unstaked here</span>
          <span>
            {account ? `${yoctoToNear(BigInt(account.unstaked_balance), 2)} Ⓝ` : '—'}
          </span>
        </div>
      </div>
      <div className="modes">
        {modes.map((m) => (
          <button
            key={m.id}
            className={mode === m.id ? 'active' : ''}
            disabled={busy}
            onClick={() => {
              setMode(m.id);
              setAmount('');
              setError('');
              setSuccess('');
            }}
          >
            {m.label}
          </button>
        ))}
      </div>
      {mode === 'fast' && isMetaPool ? (
        <>
          <div className="amount">
            <input
              type="number"
              min="0"
              placeholder="0.0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              aria-label="stNEAR amount to fast unstake"
            />
            <button
              className="max"
              disabled={busy || !liquidBalance}
              onClick={() => setAmount(yoctoToNear(BigInt(liquidBalance!)).replace(/,/g, ''))}
            >
              MAX
            </button>
            <span className="unit">stNEAR</span>
          </div>
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
            disabled={busy || !amount || Number(amount) <= 0 || !liquidBalance}
            onClick={metaFastUnstake}
          >
            {busy ? 'Confirm in wallet…' : 'Fast unstake'}
          </button>
        </>
      ) : mode === 'fast' && fastUnstakeUrl ? (
        <>
          <p className="avail">
            Receive NEAR immediately by swapping your liquid-staking token. The provider will
            show the live quote, fee, and slippage before you approve.
          </p>
          <a className="btn btn-block" href={fastUnstakeUrl} target="_blank" rel="noreferrer">
            Fast unstake on {poolId === 'meta-pool.near' ? 'Meta Pool' : 'LiNEAR'}
          </a>
        </>
      ) : mode !== 'withdraw' ? (
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
              ? `Exceeds available ${yoctoToNear(availYocto, 2)} Ⓝ`
              : `Available ${yoctoToNear(availYocto, 2)} Ⓝ`}
          </p>
          <button
            className="btn btn-block"
            disabled={busy || !amount || Number(amount) <= 0 || overMax}
            onClick={() =>
              mode === 'stake'
                ? act(
                    'deposit_and_stake',
                    { deposit: parseNearAmount(amount as `${number}`) },
                    `✓ Staked ${amount} Ⓝ`
                  )
                : amount === maxAmount
                ? act('unstake_all', {}, `✓ Unstaked ${amount} Ⓝ — unlocks in ~2 days`)
                : act(
                    'unstake',
                    { args: { amount: parseNearAmount(amount as `${number}`) } },
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
              ? `${yoctoToNear(BigInt(account.unstaked_balance), 2)} Ⓝ ready to withdraw.`
              : `${yoctoToNear(
                  BigInt(account.unstaked_balance),
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
                `✓ Withdrew ${yoctoToNear(BigInt(account?.unstaked_balance ?? '0'), 2)} Ⓝ`
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
          : mode === 'fast'
          ? 'Immediately unstake tokens, will incur in a fee.'
          : 'Withdrawing moves unlocked funds back to your wallet.'}
      </p>
    </div>
  );
}
