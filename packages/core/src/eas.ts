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

// EAS is a predeploy on Base (and other OP Stack chains).
export const EAS_CHAIN_ID = 8453
export const EAS_ADDRESS: Address = '0x4200000000000000000000000000000000000021'
// Read from the contract's version() on Base. EIP-712 domains must match it exactly.
export const EAS_VERSION = '1.0.1'

export const EAS_DOMAIN = {
  name: 'EAS Attestation',
  version: EAS_VERSION,
  chainId: EAS_CHAIN_ID,
  verifyingContract: EAS_ADDRESS,
} as const

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
    domain: typeof EAS_DOMAIN
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
    domain: typeof EAS_DOMAIN
    types: typeof ATTEST_TYPES
    primaryType: 'Attest'
    message: AttestMessage
  }
}

export function buildAttestation(params: {
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
    typedData: { domain: EAS_DOMAIN, types: ATTEST_TYPES, primaryType: 'Attest', message },
  }
}

export function toEnvelope(unsigned: UnsignedAttestation, signature: Hex, signer: Address): AttestationEnvelope {
  const { r, s, v, yParity } = parseSignature(signature)
  const { message } = unsigned.typedData
  return {
    sig: {
      version: OFFCHAIN_VERSION,
      uid: unsigned.uid,
      domain: EAS_DOMAIN,
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
    domain: EAS_DOMAIN,
    types: ATTEST_TYPES,
    primaryType: 'Attest' as const,
    message: messageOf(env),
    signature: signatureOf(env),
  }
}

/** Structural checks that don't need a signature check: domain, types, UID. */
export function checkEnvelopeShape(env: AttestationEnvelope): string | null {
  const d = env.sig.domain
  if (
    d.name !== EAS_DOMAIN.name ||
    d.version !== EAS_DOMAIN.version ||
    Number(d.chainId) !== EAS_DOMAIN.chainId ||
    d.verifyingContract.toLowerCase() !== EAS_ADDRESS.toLowerCase()
  ) return 'wrong EIP-712 domain'
  if (env.sig.primaryType !== 'Attest' || env.sig.version !== OFFCHAIN_VERSION) return 'unsupported attestation version'
  if (offchainUid(messageOf(env)) !== env.sig.uid) return 'uid does not match message'
  return null
}
