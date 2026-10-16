'use client'
import { useConfig, useReadContracts } from 'wagmi'
import { getCapabilities, sendCalls, waitForCallsStatus, waitForTransactionReceipt, writeContract } from 'wagmi/actions'
import { encodeFunctionData, zeroAddress } from 'viem'
import { SCHEMAS, SCHEMA_REGISTRY_ABI } from '@xattest/core'
import { chain, network } from './network'

/**
 * Whether xattest's EAS schemas exist on this chain, and a way to register the missing ones.
 * Schemas are global: whoever registers first pays (cents on Base), everyone after reuses them.
 */
export function useSchemas() {
  const config = useConfig()
  const { data, isLoading, refetch } = useReadContracts({
    contracts: SCHEMAS.map((s) => ({
      address: network.schemaRegistry,
      abi: SCHEMA_REGISTRY_ABI,
      functionName: 'getSchema' as const,
      args: [s.uid] as const,
      chainId: chain.id,
    })),
  })

  const missing = data ? SCHEMAS.filter((s, i) => data[i]?.result?.uid !== s.uid) : []

  /**
   * Registers whatever is missing: one batched call when the wallet supports it natively,
   * otherwise one transaction per schema.
   */
  async function ensureRegistered(): Promise<void> {
    const fresh = (await refetch()).data
    const todo = SCHEMAS.filter((s, i) => fresh?.[i]?.result?.uid !== s.uid)
    if (todo.length === 0) return

    if (todo.length > 1 && (await canBatch())) {
      try {
        const { id } = await sendCalls(config, {
          chainId: chain.id,
          calls: todo.map((s) => ({
            to: network.schemaRegistry,
            data: encodeFunctionData({ abi: SCHEMA_REGISTRY_ABI, functionName: 'register', args: [s.schema, zeroAddress, true] }),
          })),
        })
        const result = await waitForCallsStatus(config, { id })
        if (result.status !== 'success') throw new Error('schema registration failed')
        await refetch()
        return
      } catch (e) {
        if (isUserRejection(e)) throw e
        // Some wallets advertise batching but fail at send time; fall through to one tx each.
      }
    }

    for (const s of todo) {
      const hash = await writeContract(config, {
        chainId: chain.id,
        address: network.schemaRegistry,
        abi: SCHEMA_REGISTRY_ABI,
        functionName: 'register',
        args: [s.schema, zeroAddress, true],
      })
      const receipt = await waitForTransactionReceipt(config, { hash, chainId: chain.id })
      if (receipt.status !== 'success') throw new Error(`registering the ${s.name} schema reverted`)
    }
    await refetch()
  }

  /**
   * Only batch when the account can do it as-is. "ready" means the wallet would first upgrade the
   * account (EIP-7702 delegation), which many wallets don't support on every chain.
   */
  async function canBatch(): Promise<boolean> {
    try {
      const caps = await getCapabilities(config, { chainId: chain.id })
      return caps?.atomic?.status === 'supported'
    } catch {
      return false
    }
  }

  return { loading: isLoading || !data, missing, ensureRegistered }
}

function isUserRejection(e: unknown): boolean {
  for (let err = e as { code?: number; name?: string; cause?: unknown } | undefined; err; err = err.cause as typeof err) {
    if (err.code === 4001 || err.name === 'UserRejectedRequestError') return true
  }
  return false
}
