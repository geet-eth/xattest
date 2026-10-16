import { createPublicClient, http, verifyTypedData, type PublicClient } from 'viem'
import { base, baseSepolia } from 'viem/chains'
import { verifyArgs, type AttestationEnvelope, type Network } from '@xattest/core'

const CHAINS = { base, 'base-sepolia': baseSepolia }
const clients = new Map<string, PublicClient>()

function clientFor(network: Network): PublicClient {
  let client = clients.get(network.name)
  if (!client) {
    client = createPublicClient({ chain: CHAINS[network.name], transport: http(process.env.RPC_URL ?? network.rpcUrl) }) as PublicClient
    clients.set(network.name, client)
  }
  return client
}

/** EOA signatures are checked locally; anything else falls back to EIP-1271 (Safe, smart accounts) on-chain. */
export async function isValidSignature(env: AttestationEnvelope, network: Network): Promise<boolean> {
  const args = verifyArgs(env)
  if (await verifyTypedData(args).catch(() => false)) return true
  return clientFor(network).verifyTypedData(args).catch(() => false)
}
