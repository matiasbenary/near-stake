'use client';

import { useState } from 'react';
import { useIsMutating } from '@tanstack/react-query';
import { useNearWallet } from 'near-connect-hooks';
import { LiquidPools } from '@/config';
import { errMsg, stakingMutationKey } from '@/lib/staking';
import type { PositionSelection } from '@/lib/selection';
import { useLockupPosition } from '@/hooks/use-lockup';
import {
  useStakingPositions,
  useValidatorData,
  useWalletBalance,
} from '@/hooks/use-staking';
import { MyPools } from './my-pools';
import { ValidatorList } from './validator-list';
import { PoolCard } from './pool-card';
import { LockupCard } from './lockup-card';

export function StakingConsole() {
  const { signedAccountId } = useNearWallet();
  const [selectedByUser, setSelectedByUser] = useState<PositionSelection | null>(null);
  const validatorData = useValidatorData();
  const balance = useWalletBalance(signedAccountId);
  const lockup = useLockupPosition(signedAccountId);
  const staking = useStakingPositions(
    signedAccountId,
    selectedByUser?.kind === 'pool' ? selectedByUser.poolId : LiquidPools[0].id
  );
  const busy = useIsMutating({ mutationKey: stakingMutationKey }) > 0;

  const heldLiquidPool = LiquidPools.find(
    (pool) =>
      BigInt(staking.liquidBalances[pool.id] ?? '0') > 0n ||
      BigInt(staking.accounts[pool.id]?.unstaked_balance ?? '0') > 0n
  );
  const selected: PositionSelection = selectedByUser ??
    (staking.positions[0]
      ? { kind: 'pool', poolId: staking.positions[0].id }
      : heldLiquidPool
        ? { kind: 'pool', poolId: heldLiquidPool.id }
        : lockup.data
          ? { kind: 'lockup', lockupId: lockup.data.id }
          : { kind: 'pool', poolId: LiquidPools[0].id });
  const account = selected.kind === 'pool' ? staking.accounts[selected.poolId] ?? null : null;
  const loadError = staking.error ? errMsg(staking.error) : lockup.error ? errMsg(lockup.error) : '';
  const validatorError = validatorData.error ? errMsg(validatorData.error) : '';

  return (
    <div className="stack">
      {loadError && <p className="hint error">{loadError}</p>}
      <MyPools
        positions={staking.positions}
        lockup={lockup.data ?? null}
        selected={selected}
        busy={busy}
        liquidBalances={staking.liquidBalances}
        liquidAccounts={staking.accounts}
        onSelect={setSelectedByUser}
      />
      <section className="management-workspace" aria-labelledby="management-title">
        <header className="management-heading">
          <h2 className="section-label" id="management-title">Stake and manage</h2>
        </header>
        <div className="console">
          <div className="workspace-column">
            <ValidatorList
              validators={validatorData.validators}
              selected={selected.kind === 'pool' ? selected.poolId : ''}
              busy={busy}
              baseApy={validatorData.baseApy}
              fees={validatorData.fees}
              error={validatorError}
              onRetry={() => void validatorData.refetch()}
              onSelect={(poolId) => setSelectedByUser({ kind: 'pool', poolId })}
            />
          </div>
          <aside className="side action-panel">
            {selected.kind === 'lockup' && lockup.data ? (
              <LockupCard key={lockup.data.id} position={lockup.data} busy={busy} />
            ) : selected.kind === 'pool' ? (
              <PoolCard
                key={selected.poolId}
                poolId={selected.poolId}
                account={account}
                balance={balance.data ?? null}
                fee={validatorData.fees[selected.poolId]}
                baseApy={validatorData.baseApy}
                liquidBalance={staking.liquidBalances[selected.poolId]}
                busy={busy}
              />
            ) : null}
          </aside>
        </div>
      </section>
    </div>
  );
}
