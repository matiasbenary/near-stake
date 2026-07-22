# NEAR Stake

A non-custodial web interface for staking NEAR. Connect a NEAR wallet, compare liquid-staking pools and validators, stake or unstake, and track the pools in which the connected account has funds.

## What it does

- Lists active NEAR validators with net APY, uptime, stake percentage, and fee.
- Keeps Meta Pool and LiNEAR available as liquid-staking options.
- Displays direct staking balances, liquid-token balances, and pending withdrawals.
- Supports staking, normal unstaking, withdrawals, and Meta Pool fast unstaking.
- Uses the connected wallet for transactions. This app never receives or stores private keys.

## Stack

- Next.js 15 and React 18
- TypeScript
- `near-connect-hooks` and `near-api-js`
- TanStack Table for validator sorting

## Run locally

Requirements: Node.js 20 or later and npm.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Other commands:

```bash
npx tsc --noEmit
npm run build
npm run start
```

## Network

This application supports NEAR mainnet only. RPC endpoints and liquid-pool configuration live in [`src/config.ts`](src/config.ts).

## Data sources

The deployed mainnet validator directory is a static `validators.json` snapshot. The GitHub Pages workflow refreshes it hourly using NearBlocks v3, so page visitors do not call NearBlocks for the validator table. Account staking positions are discovered through FastNEAR and then verified with each pool contract's `get_account` view method. Liquid-staking token balances use `ft_balance_of`.

To authenticate snapshot refreshes, add a repository Actions secret named `NEARBLOCKS_API_KEY`. It is supplied only to the workflow's generator step and is not included in the generated site or browser requests.

## Notes

Staking and liquid-staking products carry protocol, validator, smart-contract, and market risks. APY, uptime, and fees are informational values supplied by third-party data sources and may be delayed or unavailable. Always review the transaction details in the wallet before approving.
