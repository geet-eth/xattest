import { describe, expect, it } from 'vitest'
import { Offchain, OffchainAttestationVersion, SchemaRegistry } from '@ethereum-attestation-service/eas-sdk'
import { Wallet } from 'ethers'
import { privateKeyToAccount } from 'viem/accounts'
import { verifyTypedData } from 'viem'
import {
  EAS_ADDRESS, EAS_CHAIN_ID, EAS_VERSION, POST_SCHEMA, POST_SCHEMA_UID, checkEnvelopeShape,
  decodePostData, preparePosts, toEnvelope, verifyArgs,
} from '../src/index.ts'

const PK = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d'
const account = privateKeyToAccount(PK)

describe('EAS compatibility', () => {
  it('schema uid matches eas-sdk', () => {
    expect(POST_SCHEMA_UID).toBe(SchemaRegistry.getSchemaUID(POST_SCHEMA, '0x0000000000000000000000000000000000000000', true))
  })

  it('our envelope is a valid eas-sdk offchain attestation', async () => {
    const prepared = preparePosts({ handle: '@Acme', posts: ['gm', 'second post https://Example.com/a/'], nowSeconds: 1_760_000_000 })
    const signature = await account.signTypedData(prepared.typedData)
    const env = toEnvelope(prepared, signature, account.address)

    expect(checkEnvelopeShape(env)).toBeNull()
    expect(await verifyTypedData(verifyArgs(env))).toBe(true)
    expect(decodePostData(env.sig.message.data)).toMatchObject({ handle: 'acme' })

    const offchain = new Offchain(
      { address: EAS_ADDRESS, version: EAS_VERSION, chainId: BigInt(EAS_CHAIN_ID) },
      OffchainAttestationVersion.Version2,
      {} as never, // EAS contract handle, only used for on-chain verification
    )
    const sdkSig = { ...env.sig, domain: { ...env.sig.domain, chainId: BigInt(EAS_CHAIN_ID) }, message: { ...env.sig.message, time: BigInt(env.sig.message.time), expirationTime: BigInt(env.sig.message.expirationTime) } }
    expect(offchain.verifyOffchainAttestationSignature(account.address, sdkSig as never)).toBe(true)

    // And the SDK signing the same message produces the same UID.
    const m = prepared.typedData.message
    const fromSdk = await offchain.signOffchainAttestation(
      { schema: m.schema, recipient: m.recipient, time: m.time, expirationTime: m.expirationTime, revocable: m.revocable, refUID: m.refUID, data: m.data, salt: m.salt },
      new Wallet(PK),
    )
    expect(fromSdk.uid).toBe(prepared.uid)
  })
})
