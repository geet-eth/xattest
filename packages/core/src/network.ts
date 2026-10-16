import type { Address } from 'viem'

export type NetworkName = 'base' | 'base-sepolia'

export type Network = {
  name: NetworkName
  chainId: number
  /** EAS and SchemaRegistry are predeploys on OP Stack chains. */
  eas: Address
  schemaRegistry: Address
  /** The EAS contract's version(). EIP-712 domains must match it exactly, and it differs per chain. */
  easVersion: string
  easscan: string
  rpcUrl: string
  explorer: string
}

export const NETWORKS: Record<NetworkName, Network> = {
  base: {
    name: 'base',
    chainId: 8453,
    eas: '0x4200000000000000000000000000000000000021',
    schemaRegistry: '0x4200000000000000000000000000000000000020',
    easVersion: '1.0.1',
    easscan: 'https://base.easscan.org',
    rpcUrl: 'https://mainnet.base.org',
    explorer: 'https://basescan.org',
  },
  'base-sepolia': {
    name: 'base-sepolia',
    chainId: 84532,
    eas: '0x4200000000000000000000000000000000000021',
    schemaRegistry: '0x4200000000000000000000000000000000000020',
    easVersion: '1.2.0',
    easscan: 'https://base-sepolia.easscan.org',
    rpcUrl: 'https://sepolia.base.org',
    explorer: 'https://sepolia.basescan.org',
  },
}

export const DEFAULT_NETWORK: NetworkName = 'base-sepolia'

export function getNetwork(name: string | undefined): Network {
  const n = NETWORKS[(name ?? DEFAULT_NETWORK) as NetworkName]
  if (!n) throw new Error(`unknown network "${name}", expected one of ${Object.keys(NETWORKS).join(', ')}`)
  return n
}

export function networkByChainId(chainId: number): Network | undefined {
  return Object.values(NETWORKS).find((n) => n.chainId === chainId)
}

export const SCHEMA_REGISTRY_ABI = [
  {
    type: 'function',
    name: 'register',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'schema', type: 'string' },
      { name: 'resolver', type: 'address' },
      { name: 'revocable', type: 'bool' },
    ],
    outputs: [{ type: 'bytes32' }],
  },
  {
    type: 'function',
    name: 'getSchema',
    stateMutability: 'view',
    inputs: [{ name: 'uid', type: 'bytes32' }],
    outputs: [
      {
        type: 'tuple',
        components: [
          { name: 'uid', type: 'bytes32' },
          { name: 'resolver', type: 'address' },
          { name: 'revocable', type: 'bool' },
          { name: 'schema', type: 'string' },
        ],
      },
    ],
  },
] as const
