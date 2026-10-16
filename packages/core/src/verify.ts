import type { Address, Hex } from 'viem'
import { hashPost, normalizeHandle } from './normalize.ts'
import { parseTag } from './tag.ts'
import { compareTweetIds, tweetIdToMs } from './snowflake.ts'

export type KeyRecord = {
  address: Address
  bindingUid: Hex
  addedAtMs: number
  revokedAtMs?: number
}

export type Registration = {
  handle: string
  /** Posts from this handle after this time are expected to be attested. */
  sinceMs: number
  keys: KeyRecord[]
}

export type PostAttestation = {
  uid: Hex
  tag: string
  handle: string
  posts: Hex[]
  signer: Address
  expiresAtMs: number
  /** When our index first stored it: the attestation must exist before the tweet. */
  receivedAtMs: number
}

export type Tweet = {
  id: string
  handle: string
  /** Full text with t.co links already expanded. */
  text: string
}

export type Verdict =
  | { status: 'unregistered' }
  | { status: 'pre-registration' }
  | { status: 'unattested' }
  | { status: 'attested'; uid: Hex; index: number; total: number; signer: Address }
  | { status: 'replayed'; uid: Hex; originalTweetId: string }
  | { status: 'invalid'; reason: string }

/** X's clock (tweet IDs) and ours can disagree by a little. */
export const CLOCK_SKEW_MS = 5_000

export function isKeyActive(reg: Registration, signer: Address, atMs: number): boolean {
  return reg.keys.some(
    (k) =>
      k.address.toLowerCase() === signer.toLowerCase() &&
      k.addedAtMs <= atMs &&
      (k.revokedAtMs === undefined || atMs < k.revokedAtMs),
  )
}

/**
 * Decides what a tweet's badge should be.
 * `attestation` is the one found under the tweet's tag; `claimedTweetId` is the earliest tweet
 * already recorded for the same (attestation, index), if any.
 */
export function verifyTweet(input: {
  tweet: Tweet
  registration: Registration | null
  attestation: PostAttestation | null
  claimedTweetId: string | null
}): Verdict {
  const { tweet, registration, attestation, claimedTweetId } = input
  if (!registration) return { status: 'unregistered' }

  const postedAt = tweetIdToMs(tweet.id)
  if (postedAt < registration.sinceMs) return { status: 'pre-registration' }

  const parsed = parseTag(tweet.text)
  if (!parsed) return { status: 'unattested' }
  if (!attestation || attestation.tag !== parsed.tag) return { status: 'invalid', reason: 'no attestation with this tag' }
  if (normalizeHandle(attestation.handle) !== normalizeHandle(tweet.handle))
    return { status: 'invalid', reason: 'attestation is for a different handle' }
  if (attestation.posts.length !== parsed.total) return { status: 'invalid', reason: 'thread length does not match' }
  if (hashPost(parsed.body) !== attestation.posts[parsed.index - 1])
    return { status: 'invalid', reason: 'text does not match what was signed' }
  if (postedAt + CLOCK_SKEW_MS < attestation.receivedAtMs)
    return { status: 'invalid', reason: 'posted before the attestation was published' }
  if (postedAt > attestation.expiresAtMs) return { status: 'invalid', reason: 'posted after the attestation expired' }
  if (!isKeyActive(registration, attestation.signer, attestation.receivedAtMs))
    return { status: 'invalid', reason: 'signer is not an active key for this handle' }

  if (claimedTweetId && claimedTweetId !== tweet.id && compareTweetIds(claimedTweetId, tweet.id) < 0)
    return { status: 'replayed', uid: attestation.uid, originalTweetId: claimedTweetId }

  return { status: 'attested', uid: attestation.uid, index: parsed.index, total: parsed.total, signer: attestation.signer }
}
