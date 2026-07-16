export const NetworkId =
  process.env.NEXT_PUBLIC_NEAR_NETWORK === 'testnet' ? 'testnet' : 'mainnet';

export const RpcUrls = {
  mainnet: ['https://free.rpc.fastnear.com'],
  testnet: ['https://test.rpc.fastnear.com'],
};

export const LiquidPools =
  NetworkId === 'mainnet'
    ? [
        { id: 'meta-pool.near', token: 'stNEAR' },
        { id: 'linear-protocol.near', token: 'LiNEAR' },
      ]
    : [
        { id: 'meta-v2.pool.testnet', token: 'stNEAR' },
        { id: 'linear-protocol.testnet', token: 'LiNEAR' },
      ];
