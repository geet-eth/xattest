import { describe, expect, it } from 'vitest'
import { zeroHash } from 'viem'
import {
  NETWORKS, hashPost, normalizeText, parseTag, preparePosts, tweetIdToMs, verifyTweet, weightedLength,
  type PostAttestation, type Registration,
} from '../src/index.ts'

const SIGNER = '0x000000000000000000000000000000000000dEaD' as const
// Tweet IDs encode time: build ones at known offsets.
const idAt = (ms: number) => ((BigInt(ms) - 1288834974657n) << 22n).toString()
const T0 = 1_760_000_000_000

const reg: Registration = { handle: 'acme', sinceMs: T0 - 86_400_000, keys: [{ address: SIGNER, bindingUid: zeroHash, addedAtMs: T0 - 86_400_000 }] }

function attest(posts: string[]) {
  const p = preparePosts({ network: NETWORKS['base-sepolia'], handle: 'acme', posts, nowSeconds: T0 / 1000 })
  const a: PostAttestation = {
    uid: p.uid, tag: p.tag, handle: 'acme', posts: posts.map(hashPost), signer: SIGNER,
    expiresAtMs: T0 + 30 * 60_000, receivedAtMs: T0,
  }
  return { a, texts: p.texts }
}

describe('normalization', () => {
  it('ignores link scheme, case of host, trailing slash and whitespace noise', () => {
    expect(normalizeText('hi  \r\nhttps://WWW.Example.com/Path/\n\n\n\nbye ')).toBe('hi\nexample.com/Path\n\nbye')
    expect(hashPost('café')).toBe(hashPost('café'))
  })
  it('counts weighted length like X', () => {
    expect(weightedLength('hello')).toBe(5)
    expect(weightedLength('✓ https://example.com/very/long/path')).toBe(2 + 1 + 23)
  })
})

describe('tags', () => {
  it('round-trips single and thread tags', () => {
    const { texts, a } = attest(['one', 'two', 'three'])
    expect(texts[1].endsWith(`✓ ${a.tag} · 2/3`)).toBe(true)
    expect(parseTag(texts[1])).toMatchObject({ tag: a.tag, index: 2, total: 3, body: 'two' })
    expect(parseTag(attest(['solo']).texts[0])).toMatchObject({ index: 1, total: 1, body: 'solo' })
    expect(parseTag('no tag here')).toBeNull()
  })
})

describe('verifyTweet', () => {
  const { a, texts } = attest(['gm', 'thread end'])
  const tweet = (text: string, ms = T0 + 60_000) => ({ id: idAt(ms), handle: 'Acme', text })

  it('decodes tweet id time', () => expect(tweetIdToMs(idAt(T0))).toBe(T0))

  it('attests a matching post', () => {
    expect(verifyTweet({ tweet: tweet(texts[1]), registration: reg, attestation: a, claimedTweetId: null }))
      .toMatchObject({ status: 'attested', index: 2, total: 2 })
  })
  it('flags untagged posts from registered handles', () => {
    expect(verifyTweet({ tweet: tweet('hacked, send eth'), registration: reg, attestation: null, claimedTweetId: null }).status).toBe('unattested')
  })
  it('ignores unregistered handles and old posts', () => {
    expect(verifyTweet({ tweet: tweet('x'), registration: null, attestation: null, claimedTweetId: null }).status).toBe('unregistered')
    expect(verifyTweet({ tweet: tweet('x', T0 - 2 * 86_400_000), registration: reg, attestation: null, claimedTweetId: null }).status).toBe('pre-registration')
  })
  it('rejects edited text, posts before publish, and posts after expiry', () => {
    const edited = texts[0].replace('gm', 'gm, send eth')
    expect(verifyTweet({ tweet: tweet(edited), registration: reg, attestation: a, claimedTweetId: null }).status).toBe('invalid')
    expect(verifyTweet({ tweet: tweet(texts[0], T0 - 60_000), registration: reg, attestation: a, claimedTweetId: null }).status).toBe('invalid')
    expect(verifyTweet({ tweet: tweet(texts[0], T0 + 31 * 60_000), registration: reg, attestation: a, claimedTweetId: null }).status).toBe('invalid')
  })
  it('flags a later copy as a replay but keeps the earliest as attested', () => {
    const first = tweet(texts[0], T0 + 1_000)
    const copy = tweet(texts[0], T0 + 120_000)
    expect(verifyTweet({ tweet: copy, registration: reg, attestation: a, claimedTweetId: first.id })).toMatchObject({ status: 'replayed', originalTweetId: first.id })
    expect(verifyTweet({ tweet: first, registration: reg, attestation: a, claimedTweetId: copy.id }).status).toBe('attested')
  })
  it('rejects revoked keys', () => {
    const revoked: Registration = { ...reg, keys: [{ ...reg.keys[0], revokedAtMs: T0 - 1 }] }
    expect(verifyTweet({ tweet: tweet(texts[0]), registration: revoked, attestation: a, claimedTweetId: null }).status).toBe('invalid')
  })
})
