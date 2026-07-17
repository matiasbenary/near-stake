import { mkdir, writeFile } from 'node:fs/promises';

const nearBlocks = 'https://api.nearblocks.io';
const limit = 100;
const apiKey = process.env.NEARBLOCKS_API_KEY;

async function fetchJson(path) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch(`${nearBlocks}${path}`, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
    });
    if (response.ok) return response.json();
    if (response.status !== 429 || attempt === 2) {
      throw new Error(`NearBlocks request failed (${response.status})`);
    }
    await new Promise((resolve) => setTimeout(resolve, 30_000));
  }
  throw new Error('NearBlocks validator request failed');
}

const pages = [];
let next = '';
do {
  const query = new URLSearchParams({ limit: String(limit) });
  if (next) query.set('next', next);
  const page = await fetchJson(`/v3/validators?${query}`);
  pages.push(page);
  next = page.meta?.next_page ?? '';
} while (next);

const info = await fetchJson('/v3/validators/info');
const pools = [];
const fees = {};
const seen = new Set();

for (const page of pages) {
  for (const validator of Array.isArray(page.data) ? page.data : []) {
    if (validator.staking_status !== 'active' || seen.has(validator.account_id)) continue;
    seen.add(validator.account_id);
    const uptime =
      Number.isFinite(validator.current_epoch_blocks_produced) &&
      Number.isFinite(validator.current_epoch_blocks_expected) &&
      validator.current_epoch_blocks_expected > 0
        ? (validator.current_epoch_blocks_produced / validator.current_epoch_blocks_expected) * 100
        : undefined;
    const stakePercent = Number(validator.own_stake_percent);
    pools.push({
      id: validator.account_id,
      liquid: false,
      uptime,
      stakePercent: Number.isFinite(stakePercent) ? stakePercent : undefined,
    });
    if (validator.fee_denominator > 0) {
      fees[validator.account_id] = validator.fee_numerator / validator.fee_denominator;
    }
  }
}

const apy = Number(info.data?.last_epoch_apy);
const output = { pools, fees, apy };

await mkdir('public', { recursive: true });
await writeFile('public/validators.json', `${JSON.stringify(output)}\n`);
console.log(`Wrote ${pools.length} mainnet validators to public/validators.json`);
