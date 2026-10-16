import { createPublicClient, http, verifyTypedData } from 'viem'
import { base } from 'viem/chains'
import { verifyArgs, type AttestationEnvelope } from '@xattest/core'

const client = createPublicClient({ chain: base, transport: http(process.env.BASE_RPC_URL) })

/** EOA signatures are checked locally; anything else falls back to EIP-1271 (Safe, smart accounts) on Base. */
export async function isValidSignature(env: AttestationEnvelope): Promise<boolean> {
  const args = verifyArgs(env)
  if (await verifyTypedData(args).catch(() => false)) return true
  return client.verifyTypedData(args).catch(() => false)
}
