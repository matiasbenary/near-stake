export const NetworkId =
  process.env.NEXT_PUBLIC_NEAR_NETWORK === 'testnet' ? 'testnet' : 'mainnet';

export const RpcUrls = {
  mainnet: ['https://free.rpc.fastnear.com'],
  testnet: ['https://test.rpc.fastnear.com'],
};

type LiquidPool = {
  id: string;
  token: string;
  fastExit?:
    | { type: 'metapool' }
    | { type: 'external'; url: string; label: string };
};

export const LiquidPools: LiquidPool[] =
  NetworkId === 'mainnet'
    ? [
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
      ]
    : [
        { id: 'meta-v2.pool.testnet', token: 'stNEAR', fastExit: { type: 'metapool' } },
        { id: 'linear-protocol.testnet', token: 'LiNEAR' },
      ];
