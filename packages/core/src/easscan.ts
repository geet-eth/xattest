import { deflate } from 'pako'
import { zeroAddress, zeroHash } from 'viem'
import type { AttestationEnvelope } from './eas.ts'
import { networkByChainId } from './network.ts'

/** Same compact array eas-sdk's createOffchainURL builds (field order matters). */
function compact({ sig, signer }: AttestationEnvelope) {
  const m = sig.message
  return [
    sig.domain.version,
    sig.domain.chainId,
    sig.domain.verifyingContract,
    sig.signature.r,
    sig.signature.s,
    sig.signature.v,
    signer,
    sig.uid,
    m.schema,
    m.recipient === zeroAddress ? '0' : m.recipient,
    Number(m.time),
    Number(m.expirationTime),
    m.refUID === zeroHash ? '0' : m.refUID,
    m.revocable,
    m.data,
    0,
    m.version,
    m.salt,
  ]
}

/** Link that opens the offchain attestation on easscan. The whole attestation lives in the URL fragment. */
export function easscanUrl(env: AttestationEnvelope): string {
  const zipped = deflate(JSON.stringify(compact(env)), { level: 9 })
  let binary = ''
  for (const byte of zipped) binary += String.fromCharCode(byte)
  const host = networkByChainId(Number(env.sig.domain.chainId))?.easscan
  if (!host) throw new Error(`no easscan for chain ${env.sig.domain.chainId}`)
  return `${host}/offchain/url/#attestation=${encodeURIComponent(btoa(binary))}`
}
