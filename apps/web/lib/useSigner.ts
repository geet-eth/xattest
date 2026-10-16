'use client'
import { useConnection, useSignTypedData, useSwitchChain } from 'wagmi'
import { toEnvelope, type UnsignedAttestation } from '@xattest/core'
import { chain } from './network'

/** Signs an attestation with the connected wallet, switching chains first if needed. */
export function useSigner() {
  const { address, chainId } = useConnection()
  const { mutateAsync: signTypedData } = useSignTypedData()
  const { mutateAsync: switchChain } = useSwitchChain()

  async function ensureChain() {
    if (chainId !== chain.id) await switchChain({ chainId: chain.id })
  }

  async function sign(unsigned: UnsignedAttestation) {
    if (!address) throw new Error('connect a wallet first')
    await ensureChain()
    const signature = await signTypedData(unsigned.typedData)
    return toEnvelope(unsigned, signature, address)
  }

  return { address, sign, ensureChain }
}
