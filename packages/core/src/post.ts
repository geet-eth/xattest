import type { Address } from 'viem'
import { buildAttestation, encodeBindingData, encodePostData, BINDING_SCHEMA_UID, POST_SCHEMA_UID, type UnsignedAttestation } from './eas.ts'
import { hashPost, normalizeHandle } from './normalize.ts'
import { appendTag, formatTag, tagFromUid } from './tag.ts'
import type { Network } from './network.ts'

export const DEFAULT_WINDOW_SECONDS = 30 * 60

/** Builds the attestation for a single post or thread, and the exact text to post for each. */
export function preparePosts(params: {
  network: Network
  handle: string
  posts: string[]
  nowSeconds?: number
  windowSeconds?: number
}): UnsignedAttestation & { tag: string; texts: string[] } {
  const time = params.nowSeconds ?? Math.floor(Date.now() / 1000)
  const unsigned = buildAttestation({
    network: params.network,
    schema: POST_SCHEMA_UID,
    data: encodePostData(normalizeHandle(params.handle), params.posts.map(hashPost)),
    time,
    expirationTime: time + (params.windowSeconds ?? DEFAULT_WINDOW_SECONDS),
  })
  const tag = tagFromUid(unsigned.uid)
  const total = params.posts.length
  const texts = params.posts.map((body, i) => appendTag(body, formatTag(tag, i + 1, total)))
  return { ...unsigned, tag, texts }
}

/** Builds a key binding. Self-signed (signer == key) needs a proof tweet; otherwise an active key signs for a new one. */
export function prepareBinding(params: { network: Network; handle: string; key: Address; nowSeconds?: number }) {
  const unsigned = buildAttestation({
    network: params.network,
    schema: BINDING_SCHEMA_UID,
    data: encodeBindingData(normalizeHandle(params.handle)),
    recipient: params.key,
    time: params.nowSeconds ?? Math.floor(Date.now() / 1000),
  })
  const tag = tagFromUid(unsigned.uid)
  const proofText = `Linking @${normalizeHandle(params.handle)} to signing key ${params.key} on xattest\n\n${formatTag(tag, 1, 1)}`
  return { ...unsigned, tag, proofText }
}

export function tweetIntentUrl(text: string, inReplyTo?: string): string {
  const url = new URL('https://x.com/intent/tweet')
  url.searchParams.set('text', text)
  if (inReplyTo) url.searchParams.set('in_reply_to', inReplyTo)
  return url.toString()
}

export function tweetIdFromUrl(url: string): string | null {
  return /\/status(?:es)?\/(\d+)/.exec(url)?.[1] ?? null
}
