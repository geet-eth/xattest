import { describe, expect, it } from 'vitest'
import { Offchain, OffchainAttestationVersion, SchemaRegistry, createOffchainURL, decodeBase64ZippedBase64 } from '@ethereum-attestation-service/eas-sdk'
import { Wallet } from 'ethers'
import { privateKeyToAccount } from 'viem/accounts'
import { verifyTypedData } from 'viem'
import {
  NETWORKS, POST_SCHEMA, POST_SCHEMA_UID, checkEnvelopeShape, decodePostData, easscanUrl, preparePosts, toEnvelope, verifyArgs,
} from '../src/index.ts'

const PK = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d'
const account = privateKeyToAccount(PK)

it('schema uid matches eas-sdk', () => {
  expect(POST_SCHEMA_UID).toBe(SchemaRegistry.getSchemaUID(POST_SCHEMA, '0x0000000000000000000000000000000000000000', true))
})

describe.each(Object.values(NETWORKS))('EAS compatibility on $name', (network) => {
  async function signed() {
    const prepared = preparePosts({ network, handle: '@Acme', posts: ['gm', 'second post https://Example.com/a/'], nowSeconds: 1_760_000_000 })
    const env = toEnvelope(prepared, await account.signTypedData(prepared.typedData), account.address)
    return { prepared, env }
  }

  it('our envelope is a valid eas-sdk offchain attestation', async () => {
    const { prepared, env } = await signed()
    expect(checkEnvelopeShape(env, network)).toBeNull()
    expect(await verifyTypedData(verifyArgs(env))).toBe(true)
    expect(decodePostData(env.sig.message.data)).toMatchObject({ handle: 'acme' })

    const offchain = new Offchain(
      { address: network.eas, version: network.easVersion, chainId: BigInt(network.chainId) },
      OffchainAttestationVersion.Version2,
      {} as never, // EAS contract handle, only used for on-chain verification
    )
    const sdkSig = { ...env.sig, domain: { ...env.sig.domain, chainId: BigInt(network.chainId) }, message: { ...env.sig.message, time: BigInt(env.sig.message.time), expirationTime: BigInt(env.sig.message.expirationTime) } }
    expect(offchain.verifyOffchainAttestationSignature(account.address, sdkSig as never)).toBe(true)

    // And the SDK signing the same message produces the same UID.
    const m = prepared.typedData.message
    const fromSdk = await offchain.signOffchainAttestation(
      { schema: m.schema, recipient: m.recipient, time: m.time, expirationTime: m.expirationTime, revocable: m.revocable, refUID: m.refUID, data: m.data, salt: m.salt },
      new Wallet(PK),
    )
    expect(fromSdk.uid).toBe(prepared.uid)
  })

  it('rejects attestations signed for the other network', async () => {
    const { env } = await signed()
    const other = Object.values(NETWORKS).find((n) => n.name !== network.name)!
    expect(checkEnvelopeShape(env, other)).toMatch(/signed for chain/)
  })

  // Compressed bytes can differ between pako versions; what matters is that easscan decodes the same attestation.
  it('easscan link decodes to the same attestation as eas-sdk createOffchainURL', async () => {
    const { env } = await signed()
    const payload = (url: string) => decodeBase64ZippedBase64(decodeURIComponent(url.split('#attestation=')[1]))
    expect(easscanUrl(env).startsWith(`${network.easscan}/offchain/url/#attestation=`)).toBe(true)
    expect(payload(easscanUrl(env))).toEqual(payload(createOffchainURL(env as never)))
  })
})
