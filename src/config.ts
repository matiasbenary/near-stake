export const NetworkId =
  process.env.NEXT_PUBLIC_NEAR_NETWORK === 'mainnet' ? 'mainnet' : 'testnet';

export const RpcUrls = {
  mainnet: ['https://free.rpc.fastnear.com', 'https://rpc.mainnet.near.org'],
  testnet: ['https://test.rpc.fastnear.com', 'https://rpc.testnet.near.org'],
};

export const LiquidPools =
  NetworkId === 'mainnet'
    ? [{ id: 'meta-pool.near' }, { id: 'linear-protocol.near' }]
    : [{ id: 'meta-v2.pool.testnet' }, { id: 'linear-protocol.testnet' }];
