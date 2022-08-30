# micro-web3

Typesafe Web3 with minimum deps: call eth contracts directly from JS. Batteries included.

- Connect to web3 nodes
- Write typesafe code with auto inference of TypeScript types from ABI JSON
- Fetch token balances, resolve ENS domains, watch token prices with chainlink web3 oracle
- Decode transactions: create readable tx descriptions from tx data & ABIs
- No network code in main package: allows simpler audits and offline usage
- Tiny, thanks to generic serializer: [micro-packed](https://github.com/paulmillr/micro-packed)

*Check out all web3 utility libraries:* [micro-eth-signer](https://github.com/paulmillr/micro-eth-signer), [micro-btc-signer](https://github.com/paulmillr/micro-btc-signer), [micro-sol-signer](https://github.com/paulmillr/micro-sol-signer), [micro-web3](https://github.com/paulmillr/micro-web3), [tx-tor-broadcaster](https://github.com/paulmillr/tx-tor-broadcaster)

## Usage

> npm install micro-web3

```ts
import web3 from 'micro-web3';
import contracts from 'micro-web3/contracts';
import web3net from 'micro-web3-net';
const DEF_CONTRACTS = contracts.DEFAULT_CONTRACTS;
```

### Decode transactions without network

```ts
import { hex } from '@scure/base';
const tx =
  'a9059cbb000000000000000000000000dac17f958d2ee523a2206206994597c13d831ec70000000000000000000000000000000000000000000000000000000542598700';
const decoder = new web3.Decoder();
const USDT = contracts.tokenFromSymbol('USDT').contract;
decoder.add(USDT, contracts.ERC20);
const info = decoder.decode(USDT, hex.decode(tx), { contractInfo: DEF_CONTRACTS[USDT] });
console.log(info);
// { name: 'transfer', signature: 'transfer(address,uint256)',
// value: { to: '0xdac17f958d2ee523a2206206994597c13d831ec7', value: 22588000000n },
// hint: 'Transfer 22588 USDT to 0xdac17f958d2ee523a2206206994597c13d831ec7' }
```

### Decode events

```ts
const BAT = '0x0d8775f648430679a709e98d2b0cb6250d2887ef';
const decoder = new web3.Decoder();
decoder.add(BAT, contracts.ERC20);
const info = decoder.decodeEvent(
  BAT,
  [
    '0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925',
    '0x000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa96045',
    '0x000000000000000000000000e592427a0aece92de3edee1f18e0157c05861564',
  ],
  '0x00000000000000000000000000000000000000000000003635c9adc5dea00000',
  { contract: BAT, contracts: { ...DEF_CONTRACTS }, contractInfo: DEF_CONTRACTS[BAT] }
);
console.log(info.hint);
// Allow 0xe592427a0aece92de3edee1f18e0157c05861564 spending up to 1000 BAT from 0xd8da6bf26964af9d7eed9e03e53415d37aa96045
```

### Fetch Chainlink oracle prices

```ts
import chainlink from 'micro-web3/api/chainlink';
const provider = new web3net.Web3({
  url: 'https://nodes.mewapi.io/rpc/eth',
  headers: { Origin: 'https://www.myetherwallet.com' },
});
const btc = await chainlink.coinPrice(provider, 'BTC');
const bat = await chainlink.tokenPrice(provider, 'BAT');
console.log({ btc, bat }); // BTC 19188.68870991, BAT 0.39728989 in USD
```

### Uniswap

Swap 12.12 USDT to BAT with uniswap V3 defaults of 0.5% slippage, 30 min expiration.

```ts
import univ2 from 'micro-web3/api/uniswap-v2';
import univ3 from 'micro-web3/api/uniswap-v3';

const provider = new web3net.Web3({
  url: 'https://nodes.mewapi.io/rpc/eth',
  headers: { Origin: 'https://www.myetherwallet.com' },
});
const USDT = contracts.tokenFromSymbol('USDT');
const BAT = contracts.tokenFromSymbol('BAT');
const u3 = new univ3.UniswapV3(provider); // or new univ2.UniswapV2(provider)
const fromAddress = '0xd8da6bf26964af9d7eed9e03e53415d37aa96045';
const toAddress = '0xd8da6bf26964af9d7eed9e03e53415d37aa96045';
const swap = await u3.swap(USDT, BAT, '12.12', { slippagePercent: 0.5, ttl: 30 * 60 });
const swapData = await swap.tx(fromAddress, toAddress);
console.log(swapData.amount, swapData.expectedAmount, swapData.allowance);
```

### Type inference

By offering sacrifices to The Forbidden Ones, we were able to achive basic type-safety,
however there are some limitations:

- Fixed size arrays can have 999 elements at max: string[], string[1], ..., string[999]
- Fixed size 2d arrays can have 39 elements at max: string[][], string[][1], ..., string[39][39]
- Which is enough for almost all cases
- ABI must be described as constant value: `[...] as const`
- We're not able to handle contracts with method overload (same function names with different args) — the code will still work, but not types

We're parsing values as:

```js
// no inputs
{} -> encodeInput();
// single input
{inputs: [{type: 'uint'}]} -> encodeInput(bigint);
// all inputs named
{inputs: [{type: 'uint', name: 'lol}, {type: 'address', name: 'wut'}]} -> encodeInput({lol: bigint, wut: string})
// at least one input is unnamed
{inputs: [{type: 'uint', name: 'lol}, {type: 'address'}]} -> encodeInput([bigint, string])
// Same applies for output!
```

Check out [`src/api/ens.ts`](./src/api/ens.ts) for type-safe contract execution example.

## License

MIT (c) Paul Miller [(https://paulmillr.com)](https://paulmillr.com), see LICENSE file.
