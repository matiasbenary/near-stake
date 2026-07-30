'use client';

import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNearWallet } from 'near-connect-hooks';
import { LiquidPools } from '@/config';
import {
  FASTNEAR,
  Fee,
  GAS,
  getValidatorData,
  PoolAccount,
  Position,
  Validator,
} from '@/lib/staking';

const keys = {
  validators: ['validators'] as const,
  liquidFee: (poolId: string) => ['liquid-fee', poolId] as const,
  walletBalance: (accountId: string) => ['wallet-balance', accountId] as const,
  stakingPools: (accountId: string) => ['staking-pools', accountId] as const,
  liquidBalance: (accountId: string, poolId: string) =>
    ['liquid-balance', accountId, poolId] as const,
  poolAccount: (accountId: string, poolId: string) =>
    ['pool-account', accountId, poolId] as const,
};

export const stakingMutationKey = ['staking-action'] as const;

export function useValidatorData() {
  const { provider, viewFunction } = useNearWallet();
  const validators = useQuery({
    queryKey: keys.validators,
    staleTime: 60 * 60 * 1000,
    queryFn: async () => {
      let { pools, fees, apy } = await getValidatorData();
      if (pools.length === 0) {
        const { current_validators } = await provider.viewValidators();
        pools = current_validators
          .filter((validator) => validator.account_id.includes('.pool'))
          .sort((a, b) => (BigInt(a.stake) < BigInt(b.stake) ? 1 : -1))
          .map((validator) => ({ id: validator.account_id, liquid: false }));
      }
      return {
        validators: [
          ...LiquidPools.map((pool) => ({ id: pool.id, liquid: true })),
          ...pools,
        ] satisfies Validator[],
        fees,
        baseApy: apy,
      };
    },
  });

  const liquidFees = useQueries({
    queries: LiquidPools.map((pool) => ({
      queryKey: keys.liquidFee(pool.id),
      staleTime: 5 * 60 * 1000,
      queryFn: () =>
        viewFunction({
          contractId: pool.id,
          method: 'get_reward_fee_fraction',
          args: {},
        }) as Promise<Fee>,
    })),
  });

  const liquidFeeMap = Object.fromEntries(
    liquidFees.flatMap((query, index) => {
      const fee = query.data;
      return fee && fee.denominator > 0
        ? [[LiquidPools[index].id, fee.numerator / fee.denominator]]
        : [];
    })
  );

  return {
    validators: validators.data?.validators ?? [],
    fees: { ...(validators.data?.fees ?? {}), ...liquidFeeMap },
    baseApy: validators.data?.baseApy ?? null,
    error: validators.error ?? liquidFees.find((query) => query.error)?.error ?? null,
    refetch: () =>
      Promise.all([validators.refetch(), ...liquidFees.map((query) => query.refetch())]),
  };
}

export function useWalletBalance(accountId: string) {
  const { provider } = useNearWallet();
  return useQuery({
    queryKey: keys.walletBalance(accountId),
    enabled: accountId.length > 0,
    staleTime: 30_000,
    queryFn: async () =>
      (
        await provider.viewAccount({
          accountId,
          blockQuery: { finality: 'optimistic' },
        })
      ).amount.toString(),
  });
}

function useStakingPools(accountId: string) {
  return useQuery({
    queryKey: keys.stakingPools(accountId),
    enabled: accountId.length > 0,
    staleTime: 30_000,
    queryFn: async () => {
      const response = await fetch(`${FASTNEAR}/v1/account/${accountId}/staking`);
      if (!response.ok) throw new Error(`Staking positions request failed (${response.status})`);
      const data = (await response.json()) as { pools?: { pool_id: string }[] };
      return data.pools ?? [];
    },
  });
}

export function useStakingPositions(accountId: string, selectedPoolId: string) {
  const { viewFunction } = useNearWallet();
  const stakingPools = useStakingPools(accountId);
  const poolIds = [
    ...new Set([
      selectedPoolId,
      ...(stakingPools.data ?? []).map((pool) => pool.pool_id),
      ...LiquidPools.map((pool) => pool.id),
    ]),
  ].filter(Boolean);

  const poolAccounts = useQueries({
    queries: poolIds.map((poolId) => ({
      queryKey: keys.poolAccount(accountId, poolId),
      enabled: accountId.length > 0,
      staleTime: 30_000,
      queryFn: () =>
        viewFunction({
          contractId: poolId,
          method: 'get_account',
          args: { account_id: accountId },
        }) as Promise<PoolAccount>,
    })),
  });

  const liquidBalanceQueries = useQueries({
    queries: LiquidPools.map((pool) => ({
      queryKey: keys.liquidBalance(accountId, pool.id),
      enabled: accountId.length > 0,
      staleTime: 30_000,
      queryFn: () =>
        viewFunction({
          contractId: pool.id,
          method: 'ft_balance_of',
          args: { account_id: accountId },
        }) as Promise<string>,
    })),
  });

  const accounts = Object.fromEntries(
    poolAccounts.flatMap((query, index) =>
      query.data ? [[poolIds[index], query.data]] : []
    )
  ) as Record<string, PoolAccount>;
  const liquidBalances = Object.fromEntries(
    liquidBalanceQueries.flatMap((query, index) =>
      query.data !== undefined ? [[LiquidPools[index].id, query.data]] : []
    )
  ) as Record<string, string>;
  const positions = (stakingPools.data ?? [])
    .filter((pool) => !LiquidPools.some((liquidPool) => liquidPool.id === pool.pool_id))
    .map((pool): Position | null => {
      const account = accounts[pool.pool_id];
      if (!account) return null;
      return {
        id: pool.pool_id,
        staked_balance: BigInt(account.staked_balance),
        unstaked_balance: BigInt(account.unstaked_balance),
        can_withdraw: account.can_withdraw,
      };
    })
    .filter((position): position is Position => position !== null)
    .filter((position) => position.staked_balance > 0n || position.unstaked_balance > 0n);

  return {
    positions,
    accounts,
    liquidBalances,
    error:
      stakingPools.error ??
      poolAccounts.find((query) => query.error)?.error ??
      liquidBalanceQueries.find((query) => query.error)?.error ??
      null,
  };
}

export type StakingAction =
  | { type: 'stake'; amount: string }
  | { type: 'unstake'; amount?: string }
  | { type: 'withdraw' }
  | { type: 'fastUnstake'; amount: string };

export function useStakingAction(poolId: string) {
  const { signedAccountId, callFunction, viewFunction } = useNearWallet();
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [...stakingMutationKey, signedAccountId, poolId],
    mutationFn: async (action: StakingAction) => {
      if (action.type === 'stake') {
        return callFunction({
          contractId: poolId,
          method: 'deposit_and_stake',
          gas: GAS.toString(),
          deposit: action.amount,
        });
      }
      if (action.type === 'unstake') {
        return callFunction({
          contractId: poolId,
          method: action.amount ? 'unstake' : 'unstake_all',
          gas: GAS.toString(),
          args: action.amount ? { amount: action.amount } : {},
        });
      }
      if (action.type === 'withdraw') {
        return callFunction({
          contractId: poolId,
          method: 'withdraw_all',
          gas: GAS.toString(),
        });
      }

      const stNearPrice = BigInt(
        (await viewFunction({
          contractId: poolId,
          method: 'get_st_near_price',
          args: {},
        })) as string
      );
      const minExpectedNear = (BigInt(action.amount) * stNearPrice * 95n) / (100n * 10n ** 24n);
      return callFunction({
        contractId: poolId,
        method: 'liquid_unstake',
        gas: GAS.toString(),
        args: {
          st_near_to_burn: action.amount,
          min_expected_near: minExpectedNear.toString(),
        },
      });
    },
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.walletBalance(signedAccountId) }),
        queryClient.invalidateQueries({ queryKey: keys.stakingPools(signedAccountId) }),
        queryClient.invalidateQueries({ queryKey: ['pool-account', signedAccountId] }),
        queryClient.invalidateQueries({ queryKey: ['liquid-balance', signedAccountId] }),
      ]),
  });
}
