import {
  encodeAbiParameters,
  decodeAbiParameters,
  encodePacked,
  keccak256,
  parseSignature,
  serializeSignature,
  stringToHex,
  zeroAddress,
  zeroHash,
  type Address,
  type Hex,
} from 'viem'

import type { Network } from './network.ts'

export type EasDomain = { name: 'EAS Attestation'; version: string; chainId: number; verifyingContract: Address }

export function easDomain(network: Network): EasDomain {
  return { name: 'EAS Attestation', version: network.easVersion, chainId: network.chainId, verifyingContract: network.eas }
}

// Offchain attestation v2 (with salt), identical to eas-sdk's OFFCHAIN_ATTESTATION_TYPES[2].
export const ATTEST_TYPES = {
  Attest: [
    { name: 'version', type: 'uint16' },
    { name: 'schema', type: 'bytes32' },
    { name: 'recipient', type: 'address' },
    { name: 'time', type: 'uint64' },
    { name: 'expirationTime', type: 'uint64' },
    { name: 'revocable', type: 'bool' },
    { name: 'refUID', type: 'bytes32' },
    { name: 'data', type: 'bytes' },
    { name: 'salt', type: 'bytes32' },
  ],
} as const

const OFFCHAIN_VERSION = 2

export function schemaUid(schema: string, resolver: Address = zeroAddress, revocable = true): Hex {
  return keccak256(encodePacked(['string', 'address', 'bool'], [schema, resolver, revocable]))
}

// A set of posts (a single tweet or a whole thread) the signer approves for a handle.
export const POST_SCHEMA = 'string handle,bytes32[] posts'
// Links a signing key (the recipient) to a handle.
export const BINDING_SCHEMA = 'string handle'

export const POST_SCHEMA_UID = schemaUid(POST_SCHEMA)
export const BINDING_SCHEMA_UID = schemaUid(BINDING_SCHEMA)

/** Every schema xattest uses. Registered once per chain, by anyone; UIDs don't depend on who registers. */
export const SCHEMAS = [
  { name: 'post', schema: POST_SCHEMA, uid: POST_SCHEMA_UID },
  { name: 'binding', schema: BINDING_SCHEMA, uid: BINDING_SCHEMA_UID },
] as const

export type AttestMessage = {
  version: number
  schema: Hex
  recipient: Address
  time: bigint
  expirationTime: bigint
  revocable: boolean
  refUID: Hex
  data: Hex
  salt: Hex
}

// JSON-safe EAS offchain attestation, in the same shape easscan uses ({ sig, signer }).
export type AttestationEnvelope = {
  sig: {
    version: number
    uid: Hex
    domain: EasDomain
    primaryType: 'Attest'
    types: typeof ATTEST_TYPES
    message: Omit<AttestMessage, 'time' | 'expirationTime'> & { time: string; expirationTime: string }
    signature: { v: number; r: Hex; s: Hex }
  }
  signer: Address
}

export function offchainUid(m: AttestMessage): Hex {
  // eas-sdk hashes the schema UID's hex *string* as utf8 bytes; mirror it so UIDs match easscan.
  return keccak256(
    encodePacked(
      ['uint16', 'bytes', 'address', 'address', 'uint64', 'uint64', 'bool', 'bytes32', 'bytes', 'bytes32', 'uint32'],
      [m.version, stringToHex(m.schema), m.recipient, zeroAddress, m.time, m.expirationTime, m.revocable, m.refUID, m.data, m.salt, 0],
    ),
  )
}

export function randomSalt(): Hex {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`
}

export function encodePostData(handle: string, posts: Hex[]): Hex {
  return encodeAbiParameters([{ type: 'string' }, { type: 'bytes32[]' }], [handle, posts])
}

export function decodePostData(data: Hex): { handle: string; posts: Hex[] } {
  const [handle, posts] = decodeAbiParameters([{ type: 'string' }, { type: 'bytes32[]' }], data)
  return { handle, posts: [...posts] }
}

export function encodeBindingData(handle: string): Hex {
  return encodeAbiParameters([{ type: 'string' }], [handle])
}

export function decodeBindingData(data: Hex): { handle: string } {
  const [handle] = decodeAbiParameters([{ type: 'string' }], data)
  return { handle }
}

export type UnsignedAttestation = {
  uid: Hex
  typedData: {
    domain: EasDomain
    types: typeof ATTEST_TYPES
    primaryType: 'Attest'
    message: AttestMessage
  }
}

export function buildAttestation(params: {
  network: Network
  schema: Hex
  data: Hex
  recipient?: Address
  time: number // unix seconds
  expirationTime?: number // unix seconds, 0 = never
  refUID?: Hex
  salt?: Hex
}): UnsignedAttestation {
  const message: AttestMessage = {
    version: OFFCHAIN_VERSION,
    schema: params.schema,
    recipient: params.recipient ?? zeroAddress,
    time: BigInt(params.time),
    expirationTime: BigInt(params.expirationTime ?? 0),
    revocable: true,
    refUID: params.refUID ?? zeroHash,
    data: params.data,
    salt: params.salt ?? randomSalt(),
  }
  return {
    uid: offchainUid(message),
    typedData: { domain: easDomain(params.network), types: ATTEST_TYPES, primaryType: 'Attest', message },
  }
}

export function toEnvelope(unsigned: UnsignedAttestation, signature: Hex, signer: Address): AttestationEnvelope {
  const { r, s, v, yParity } = parseSignature(signature)
  const { message } = unsigned.typedData
  return {
    sig: {
      version: OFFCHAIN_VERSION,
      uid: unsigned.uid,
      domain: unsigned.typedData.domain,
      primaryType: 'Attest',
      types: ATTEST_TYPES,
      message: { ...message, time: message.time.toString(), expirationTime: message.expirationTime.toString() },
      signature: { v: Number(v ?? BigInt(yParity + 27)), r, s },
    },
    signer,
  }
}

export function messageOf(env: AttestationEnvelope): AttestMessage {
  const m = env.sig.message
  return { ...m, time: BigInt(m.time), expirationTime: BigInt(m.expirationTime) }
}

export function signatureOf(env: AttestationEnvelope): Hex {
  const { r, s, v } = env.sig.signature
  return serializeSignature({ r, s, v: BigInt(v) })
}

/**
 * Arguments for viem's verifyTypedData. Use a public client's verifyTypedData to also
 * accept smart-contract signers (EIP-1271, e.g. a Safe).
 */
export function verifyArgs(env: AttestationEnvelope) {
  return {
    address: env.signer,
    domain: { ...env.sig.domain, chainId: Number(env.sig.domain.chainId) },
    types: ATTEST_TYPES,
    primaryType: 'Attest' as const,
    message: messageOf(env),
    signature: signatureOf(env),
  }
}

/** Structural checks that don't need a signature check: domain (for this network), types, UID. */
export function checkEnvelopeShape(env: AttestationEnvelope, network: Network): string | null {
  const d = env.sig.domain
  const expected = easDomain(network)
  if (Number(d.chainId) !== expected.chainId) return `signed for chain ${d.chainId}, this server uses ${network.name} (${expected.chainId})`
  if (
    d.name !== expected.name ||
    d.version !== expected.version ||
    d.verifyingContract.toLowerCase() !== expected.verifyingContract.toLowerCase()
  ) return 'wrong EIP-712 domain'
  if (env.sig.primaryType !== 'Attest' || env.sig.version !== OFFCHAIN_VERSION) return 'unsupported attestation version'
  if (offchainUid(messageOf(env)) !== env.sig.uid) return 'uid does not match message'
  return null
}
