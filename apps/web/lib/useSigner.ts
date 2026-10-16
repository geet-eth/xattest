'use client'
import { useConnection, useSignTypedData, useSwitchChain } from 'wagmi'
import { base } from 'wagmi/chains'
import { toEnvelope, type UnsignedAttestation } from '@xattest/core'

/** Signs an attestation with the connected wallet, switching to Base first if needed. */
export function useSigner() {
  const { address, chainId } = useConnection()
  const { mutateAsync: signTypedData } = useSignTypedData()
  const { mutateAsync: switchChain } = useSwitchChain()

  async function sign(unsigned: UnsignedAttestation) {
    if (!address) throw new Error('connect a wallet first')
    if (chainId !== base.id) await switchChain({ chainId: base.id })
    const signature = await signTypedData(unsigned.typedData)
    return toEnvelope(unsigned, signature, address)
  }

  return { address, sign }
}
