import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'
import {
  BINDING_SCHEMA_UID, POST_SCHEMA_UID, checkEnvelopeShape, easscanUrl, getNetwork, compareTweetIds, decodeBindingData, decodePostData,
  isKeyActive, normalizeHandle, parseTag, tagFromUid, tweetIdToMs, verifyTweet, CLOCK_SKEW_MS,
  type AttestationEnvelope, type Registration, type Verdict,
} from '@xattest/core'
import { zeroAddress, type Hex } from 'viem'
import { Store, type StoredPost } from './store.ts'
import { fetchTweet } from './twitter.ts'
import { isValidSignature } from './signature.ts'
import { log } from './log.ts'

const MAX_CLOCK_DRIFT_MS = 5 * 60_000
const MAX_POST_WINDOW_MS = 24 * 60 * 60_000
const MAX_BINDING_AGE_MS = 24 * 60 * 60_000
const MAX_THREAD_LENGTH = 25

const network = getNetwork(process.env.XATTEST_NETWORK)
// One store per network: attestations are signed for a specific chain.
const store = new Store(process.env.DATA_PATH ?? `data/${network.name}.json`)
const app = new Hono()

app.use('*', cors())
app.use('*', async (c, next) => {
  const start = Date.now()
  await next()
  log('request', { method: c.req.method, path: c.req.path, query: c.req.query(), status: c.res.status, ms: Date.now() - start })
})

const fail = (status: 400 | 403 | 404 | 409 | 502, message: string): never => {
  throw new HTTPException(status, { message })
}

async function checkEnvelope(env: AttestationEnvelope | undefined, schema: Hex) {
  if (!env?.sig?.message || !env.signer) fail(400, 'missing envelope')
  const shapeError = checkEnvelopeShape(env!, network)
  if (shapeError) fail(400, shapeError)
  if (env!.sig.message.schema !== schema) fail(400, 'wrong schema')
  if (!(await isValidSignature(env!, network))) fail(400, 'bad signature')
  return env!
}

app.get('/health', (c) => c.json({ ok: true, network: network.name, chainId: network.chainId }))

/** Registered handles; the extension caches this so it only asks about tweets that matter. */
app.get('/handles', (c) => c.json({ handles: store.handles() }))

app.get('/registrations/:handle', (c) => {
  const reg = store.registration(normalizeHandle(c.req.param('handle')))
  return reg ? c.json(reg) : c.json({ error: 'not registered' }, 404)
})

/**
 * Links a key to a handle.
 * First key: the key signs its own binding and the account posts a proof tweet carrying its tag.
 * Later keys: an already-active key signs the binding, no tweet needed, so a hijacked account
 * can't add its own key.
 */
app.post('/bindings', async (c) => {
  const body = await c.req.json<{ envelope?: AttestationEnvelope; proofTweetId?: string }>()
  const env = await checkEnvelope(body.envelope, BINDING_SCHEMA_UID)
  const m = env.sig.message
  const handle = normalizeHandle(decodeBindingData(m.data).handle)
  const key = m.recipient
  const signedAtMs = Number(m.time) * 1000
  const now = Date.now()
  if (key === zeroAddress) fail(400, 'binding has no key')
  if (signedAtMs > now + MAX_CLOCK_DRIFT_MS || signedAtMs < now - MAX_BINDING_AGE_MS) fail(400, 'binding is too old or in the future')

  const existing = store.registration(handle)
  let reg: Registration

  if (!existing) {
    if (env.signer.toLowerCase() !== key.toLowerCase()) fail(403, 'the first key must sign its own binding')
    if (!body.proofTweetId) fail(400, 'proofTweetId required for the first key')
    const tweet = await fetchTweet(body.proofTweetId!).catch(() => fail(502, 'could not fetch proof tweet'))
    if (!tweet) fail(404, 'proof tweet not found')
    if (tweet!.handle !== handle) fail(403, 'proof tweet is from a different account')
    if (parseTag(tweet!.text)?.tag !== tagFromUid(env.sig.uid)) fail(403, 'proof tweet does not carry this binding tag')
    if (!tweet!.text.toLowerCase().includes(key.toLowerCase())) fail(403, 'proof tweet does not mention the key')
    const postedAt = tweetIdToMs(tweet!.id)
    if (postedAt + CLOCK_SKEW_MS < signedAtMs) fail(403, 'proof tweet predates the binding')
    reg = { handle, sinceMs: postedAt, keys: [{ address: key, bindingUid: env.sig.uid, addedAtMs: postedAt }] }
  } else {
    // TODO: recovery path for a lost key (time-delayed tweet proof that active keys can veto).
    if (!isKeyActive(existing, env.signer, now)) fail(403, 'new keys must be signed by an active key')
    if (isKeyActive(existing, key, now)) fail(409, 'key already active')
    reg = { ...existing, keys: [...existing.keys, { address: key, bindingUid: env.sig.uid, addedAtMs: now }] }
  }

  store.putRegistration(reg, { uid: env.sig.uid, handle, key, envelope: env, proofTweetId: body.proofTweetId })
  log('binding', { handle, key, signer: env.signer, uid: env.sig.uid, firstKey: !existing })
  return c.json(reg)
})

/** Publishes a signed post/thread. Must happen before the posts go out. */
app.post('/attestations', async (c) => {
  const body = await c.req.json<{ envelope?: AttestationEnvelope }>()
  const env = await checkEnvelope(body.envelope, POST_SCHEMA_UID)
  const m = env.sig.message
  const { handle: rawHandle, posts } = decodePostData(m.data)
  const handle = normalizeHandle(rawHandle)
  const now = Date.now()
  const timeMs = Number(m.time) * 1000
  const expiresAtMs = Number(m.expirationTime) * 1000

  if (handle !== rawHandle) fail(400, 'handle must be normalized')
  if (posts.length < 1 || posts.length > MAX_THREAD_LENGTH) fail(400, `1-${MAX_THREAD_LENGTH} posts per attestation`)
  if (Math.abs(now - timeMs) > MAX_CLOCK_DRIFT_MS) fail(400, 'attestation time is too far from now')
  if (expiresAtMs <= now || expiresAtMs - timeMs > MAX_POST_WINDOW_MS) fail(400, 'bad expiration')

  const reg = store.registration(handle)
  if (!reg) fail(404, 'handle is not registered')
  if (!isKeyActive(reg!, env.signer, now)) fail(403, 'signer is not an active key for this handle')

  const post: StoredPost = {
    uid: env.sig.uid, tag: tagFromUid(env.sig.uid), handle, posts, signer: env.signer,
    expiresAtMs, receivedAtMs: now, envelope: env,
  }
  if (!store.putPost(post)) fail(409, 'tag collision, sign again')
  const stored = store.post(post.uid)!
  log('attestation', { handle, uid: stored.uid, tag: stored.tag, posts: posts.length, signer: env.signer, expiresAt: new Date(expiresAtMs).toISOString() })
  return c.json({ uid: stored.uid, tag: stored.tag, receivedAtMs: stored.receivedAtMs })
})

app.get('/attestations/:uid', (c) => {
  const post = store.post(c.req.param('uid'))
  return post ? c.json({ ...post, easscanUrl: easscanUrl(post.envelope) }) : c.json({ error: 'not found' }, 404)
})

/** Verdict for one tweet. Fetches the tweet from X itself rather than trusting the caller. */
app.get('/verify', async (c) => {
  const tweetId = c.req.query('tweetId')
  if (!tweetId || !/^\d+$/.test(tweetId)) fail(400, 'tweetId required')
  const tweet = await fetchTweet(tweetId!).catch(() => fail(502, 'could not fetch tweet'))
  if (!tweet) fail(404, 'tweet not found')

  const registration = store.registration(tweet!.handle)
  const proof = registration ? store.bindingByProofTweet(tweet!.id) : null
  if (proof && proof.handle === tweet!.handle) {
    log('verdict', { tweetId, handle: tweet!.handle, status: 'registration-proof' })
    return c.json({ tweetId, handle: tweet!.handle, verdict: { status: 'registration-proof', key: proof.key } satisfies Verdict, easscanUrl: easscanUrl(proof.envelope) })
  }
  const parsed = parseTag(tweet!.text)
  const attestation = parsed && registration ? store.postByTag(tweet!.handle, parsed.tag) : null
  const claimedTweetId = attestation && parsed ? store.claim(attestation.uid, parsed.index) : null
  const verdict = verifyTweet({ tweet: tweet!, registration, attestation, claimedTweetId })

  // The earliest matching tweet owns the attestation; later copies show as replays.
  if (verdict.status === 'attested' && (!claimedTweetId || compareTweetIds(tweet!.id, claimedTweetId) < 0)) {
    store.setClaim(verdict.uid, verdict.index, tweet!.id)
  }
  log('verdict', { tweetId, handle: tweet!.handle, ...verdict, tag: parsed?.tag })
  const eas = attestation && verdict.status !== 'invalid' ? easscanUrl(attestation.envelope) : undefined
  return c.json({ tweetId, handle: tweet!.handle, verdict, easscanUrl: eas })
})

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    log('rejected', { method: c.req.method, path: c.req.path, status: err.status, error: err.message })
    return c.json({ error: err.message }, err.status)
  }
  log('error', { method: c.req.method, path: c.req.path, error: String(err?.stack ?? err) })
  return c.json({ error: 'internal error' }, 500)
})

const port = Number(process.env.PORT ?? 8787)
serve({ fetch: app.fetch, port }, () => log('started', { url: `http://localhost:${port}`, network: network.name }))
