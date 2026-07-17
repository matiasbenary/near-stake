export const NetworkId = 'mainnet';

export const RpcUrls = {
  mainnet: ['https://free.rpc.fastnear.com'],
};

type LiquidPool = {
  id: string;
  token: string;
  fastExit?:
    | { type: 'metapool' }
    | { type: 'external'; url: string; label: string };
};

export const LiquidPools: LiquidPool[] = [
  { id: 'meta-pool.near', token: 'stNEAR', fastExit: { type: 'metapool' } },
  {
    id: 'linear-protocol.near',
    token: 'LiNEAR',
    fastExit: {
      type: 'external',
      url: 'https://app.linearprotocol.org/?tab=unstake',
      label: 'LiNEAR',
    },
  },
];
