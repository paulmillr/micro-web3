import { default as fetch, FETCH_OPT } from 'micro-ftch';
// Utils
export type Web3CallArgs = {
  to?: string;
  from?: string;
  data?: string;
  nonce?: string;
  value?: string;
  gas?: string;
  gasPrice?: string;
  tag?: number | 'latest' | 'earliest' | 'pending';
};

export type Web3API = {
  ethCall: (args: Web3CallArgs) => Promise<string>;
  estimateGas: (args: Web3CallArgs) => Promise<bigint>;
};

export type Web3Options = {
  url?: string;
  apiKey?: string;
  headers?: Record<string, string>;
  sslAllowSelfSigned?: boolean;
  sslPinnedCertificates?: string[];
};

// There is no setImmediate in browser and setTimeout is slow. However, call to async function will return Promise
// which will be fullfiled only on next scheduler queue processing step and this is exactly what we need.
export const nextTick = async () => {};

export type PromiseCb<T> = {
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: any) => void;
};

type LockWrapper<T> = () => Promise<T>;
let locks: Record<string, (PromiseCb<any> & { wrapper: any })[]> = {};
export function lock<T>(key: string, wrapper: LockWrapper<T>): Promise<T> {
  return new Promise(async (resolve, reject) => {
    if (locks[key]) return void locks[key].push({ resolve, reject, wrapper });
    locks[key] = [{ resolve, reject, wrapper }];
    while (locks[key].length) {
      let p = locks[key].shift();
      try {
        try {
          p!.resolve(await p!.wrapper());
        } catch (e) {
          p!.reject(e);
        }
      } catch (err) {
        throw new Error('Lock: high-level error in resolve/reject');
      }
    }
    if (!locks[key].length) delete locks[key];
    else throw new Error('Lock: non-empty queue at the end');
  });
}

let jsonrpc_cnt = 0;
export function jsonrpc(
  url: string,
  opt?: Partial<FETCH_OPT> & {
    batch?: boolean;
    customMsg?: (id: number, method: string, ...args: any[]) => any;
  }
) {
  const lockKey = jsonrpc_cnt++;
  opt = { batch: true, ...opt };
  let id = 0;
  let handlers: Record<number, PromiseCb<any>> = {};
  const process = (id: number, data?: any[], err?: Error) => {
    handlers[id][err ? 'reject' : 'resolve'](err || data);
    delete handlers[id];
  };
  const processAll = (data?: any[], err?: Error) => {
    if (err) for (let k in handlers) process(+k, undefined, err);
    else for (let d of data as any) process(d.id, d);
  };
  const parseResp = (data: string) => {
    let res;
    try {
      res = JSON.parse(data);
    } catch (_) {
      // Hack for streaming requests on erigon
      res = data
        .split('\n')
        .filter((i) => !!i)
        .map((i) => JSON.parse(i))
        .map((i) => (Array.isArray(i) ? i : [i]))
        .reduce((acc, elm) => acc.concat(elm), []);
    }
    if (!Array.isArray(res)) res = [res];
    return res;
  };
  let send: (data: any) => Promise<any>;
  if (url.startsWith('http')) {
    send = async (data: any) => {
      try {
        const res = await fetch(url, {
          ...opt,
          type: 'text',
          data: JSON.stringify(data) as any,
          headers: { ...opt?.headers, 'Content-Type': 'application/json' },
        });
        processAll(parseResp(res));
      } catch (err: any) {
        processAll(undefined, err);
      }
    };
  }
  // No websockets/tls/net sockets here for now, since optional modules are hard
  else throw new Error('Wrong protocol');
  let queue: any[] = [];
  const call = (data: any): any =>
    new Promise((resolve, reject) => {
      handlers[data.id] = { resolve, reject };
      if (!opt?.batch) return send(data);
      queue.push(data);
      lock(`JsonRPC_batch${lockKey}`, async () => {
        if (!queue.length) return;
        let cur;
        while (cur !== queue.length) {
          cur = queue.length;
          await nextTick();
        }
        let q = queue;
        queue = [];
        await send(q);
      });
    });
  return async (method: string, ...params: any[]) => {
    const res = await call(
      opt?.customMsg
        ? opt.customMsg(id++, method, params)
        : { method, params, id: id++, jsonrpc: '2.0' }
    );
    if (opt?.customMsg) return res;
    if (res && res.error && res.error.message)
      throw new Error(`JsonRPC(${res.error.code}): ${res.error.message}`);
    return res.result;
  };
}

export function numberToHex(num: number | bigint, byteLength: number): string {
  if (!byteLength) throw new Error('byteLength target must be specified');
  const hex = num.toString(16);
  const p1 = hex.length & 1 ? `0${hex}` : hex;
  return p1.padStart(byteLength * 2, '0');
}

export function add0x(hex: string) {
  return /^0x/i.test(hex) ? hex : `0x${hex}`;
}

export function numberToHexUnpadded(num: number | bigint): string {
  let hex = num.toString(16);
  hex = hex.length & 1 ? `0${hex}` : hex;
  return hex;
}

export function hexToNumber(hex: string): bigint {
  if (typeof hex !== 'string') {
    throw new TypeError('hexToNumber: expected string, got ' + typeof hex);
  }
  return hex ? BigInt(add0x(hex)) : 0n;
}

export function ethNum(n: number | bigint | string | undefined) {
  if (typeof n === 'string') n = hexToNumber(n);
  return !n ? '0x0' : add0x(numberToHexUnpadded(n).replace(/^0+/, ''));
}

export function fromNum(n: bigint | number | string): bigint {
  if (typeof n === 'string') {
    if (n.startsWith('0x')) return hexToNumber(n);
    else return BigInt(n);
  }
  return BigInt(n);
}

// Actual web3 client
export abstract class Web3Abstract {
  abstract call(method: string, ...params: any[]): any;
  private callArgs(args: Web3CallArgs) {
    let res: Record<string, any> = {
      to: args.to?.toLowerCase(),
      from: args.from?.toLowerCase() || '0x0000000000000000000000000000000000000000',
      data: args.data && args.data,
      nonce: args.nonce && ethNum(args.nonce),
      value: args.value && ethNum(args.value),
      gas: args.gas && ethNum(args.gas),
      gasPrice: args.gasPrice && ethNum(args.gasPrice),
    };
    for (let k in res) if (!res[k]) delete res[k];
    return [res, args.tag || 'latest'];
  }
  async web3Call(method: string, params: any[]) {
    return await this.call(method, ...params);
  }
  async ethCall(args: Web3CallArgs) {
    return await this.call('eth_call', ...this.callArgs(args));
  }
  async estimateGas(args: Web3CallArgs) {
    return hexToNumber(await this.call('eth_estimateGas', ...this.callArgs(args)));
  }
}

export class Web3 extends Web3Abstract {
  connected = true;
  url: string;
  call: Web3Abstract['call'];
  constructor({ url, headers, sslAllowSelfSigned, sslPinnedCertificates }: Web3Options) {
    super();
    if (!url) throw new Error('Web3 wrong options');
    this.url = url;
    this.call = jsonrpc(url, { headers, sslAllowSelfSigned, sslPinnedCertificates });
  }
}

const ETHERSCAN_PARAMS: Record<string, string[]> = {
  eth_blockNumber: [],
  eth_gasPrice: [],
  eth_getBlockByNumber: ['tag', 'boolean'],
  eth_getBlockTransactionCountByNumber: ['tag'],
  eth_getTransactionByHash: ['txhash'],
  eth_getTransactionReceipt: ['txhash'],
  eth_sendRawTransaction: ['hex'],
  eth_getBalance: ['address', 'tag'],
  eth_getTransactionCount: ['address', 'tag'],
  eth_getCode: ['address', 'tag'],
  eth_getStorageAt: ['address', 'position', 'tag'],
  account_txlist: ['address', 'startblock', 'page'],
  account_txlistinternal: ['address', 'startblock'],
  account_tokentx: ['address', 'startblock'],
};

export class EtherscanHTTP extends Web3Abstract {
  apiKey: string;
  private headers?: Record<string, string>;
  constructor({ apiKey, headers }: Web3Options) {
    super();
    if (!apiKey) throw new Error('Etherscan wrong options');
    this.apiKey = apiKey;
    this.headers = headers;
  }
  async call(method: string, ...params: any[]) {
    let qs: string[];
    if (ETHERSCAN_PARAMS[method]) {
      qs = params.map((v, i) => `${ETHERSCAN_PARAMS[method][i]}=${v}`);
    } else if (['eth_call', 'eth_estimateGas'].includes(method)) {
      qs = Object.keys(params[0])
        .filter((k) => params[0][k])
        .map((k) => `${k}=${params[0][k]}`);
      if (params[1]) qs.push(`tag=${params[1]}`);
    } else throw new Error('Unsupported method');
    let _module = 'proxy';
    if (method === 'eth_getBalance') [method, _module] = ['balance', 'account'];
    if (method.startsWith('account_')) [method, _module] = [method.slice(8), 'account'];
    let res = await fetch(
      `https://api.etherscan.io/api?module=${_module}&action=${method}&${qs.join('&')}&apikey=${
        this.apiKey
      }`,
      { type: 'json', headers: this.headers }
    );
    if (res.message === 'NOTOK') throw new Error(`EtherscanHTTP(${res.status}): ${res.result}`);
    if (res.error && res.error.message)
      throw new Error(`EtherscanHTTP(${res.error.code}): ${res.error.message}`);
    else return res.result;
  }
  async autocomplete(address: string) {
    const addresses = await fetch(`https://etherscan.io/searchHandler?term=${address}&filterby=0`, {
      type: 'json',
      headers: this.headers,
    });
    return addresses.map((i: string) => i.split('\t')[0]).slice(1);
  }
}
