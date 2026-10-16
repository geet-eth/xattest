import type { Verdict } from '@xattest/core'
import type { Status, StatusRequest, VerifyRequest, VerifyResponse } from './messages.ts'

declare const __XATTEST_API_URL__: string // injected by build.mjs
const API_URL = __XATTEST_API_URL__
const HANDLES_TTL_MS = 5 * 60_000
// When a post comes from an account we don't know, re-fetch the list at most this often,
// so newly registered accounts show up quickly.
const HANDLES_MISS_REFRESH_MS = 15_000
// Unattested/invalid verdicts can change (e.g. a replay gets detected later), so don't keep them long.
const VERDICT_TTL_MS: Record<Verdict['status'], number> = {
  attested: 60 * 60_000,
  replayed: 60 * 60_000,
  'pre-registration': 60 * 60_000,
  'registration-proof': 60 * 60_000,
  unregistered: 5 * 60_000,
  unattested: 60_000,
  invalid: 60_000,
}

let handles: { at: number; set: Set<string> } | null = null
let handlesInFlight: Promise<Set<string>> | null = null
const verdicts = new Map<string, { at: number; verdict: Verdict }>()
const inFlight = new Map<string, Promise<Verdict>>()
const recent: Status['recent'] = []
let skipped = 0

async function fetchHandles(): Promise<Set<string>> {
  handlesInFlight ??= fetch(`${API_URL}/handles`)
    .then((r) => r.json() as Promise<{ handles: string[] }>)
    .then(({ handles: list }) => {
      handles = { at: Date.now(), set: new Set(list) }
      return handles.set
    })
    .finally(() => (handlesInFlight = null))
  return handlesInFlight
}

async function isRegistered(handle: string): Promise<boolean> {
  const h = handle.toLowerCase()
  const age = handles ? Date.now() - handles.at : Infinity
  if (age > HANDLES_TTL_MS) return (await fetchHandles()).has(h)
  if (handles!.set.has(h)) return true
  if (age > HANDLES_MISS_REFRESH_MS) return (await fetchHandles()).has(h)
  return false
}

async function verify(tweetId: string, handle: string): Promise<Verdict> {
  // Skip the network for accounts that never registered: that's almost every tweet.
  if (!(await isRegistered(handle))) {
    skipped++
    return { status: 'unregistered' }
  }

  const hit = verdicts.get(tweetId)
  if (hit && Date.now() - hit.at < VERDICT_TTL_MS[hit.verdict.status]) return hit.verdict

  let pending = inFlight.get(tweetId)
  if (!pending) {
    pending = fetch(`${API_URL}/verify?tweetId=${tweetId}`)
      .then(async (r) => {
        const body = await r.json()
        if (!r.ok) throw new Error(body.error ?? `verify failed (${r.status})`)
        const verdict = body.verdict as Verdict
        verdicts.set(tweetId, { at: Date.now(), verdict })
        recent.unshift({ tweetId, handle, status: verdict.status, at: Date.now() })
        recent.length = Math.min(recent.length, 20)
        return verdict
      })
      .finally(() => inFlight.delete(tweetId))
    inFlight.set(tweetId, pending)
  }
  return pending
}

async function status(): Promise<Status> {
  let api: Status['api']
  try {
    const health = await (await fetch(`${API_URL}/health`)).json()
    api = { ok: true, network: health.network }
  } catch (e) {
    api = { ok: false, error: String((e as Error)?.message ?? e) }
  }
  const list = api.ok ? [...(await fetchHandles().catch(() => new Set<string>()))] : []
  return { apiUrl: API_URL, api, handles: list, recent, skipped }
}

chrome.runtime.onMessage.addListener((msg: VerifyRequest | StatusRequest, _sender, sendResponse) => {
  if (msg?.type === 'verify') {
    verify(msg.tweetId, msg.handle)
      .then((verdict) => sendResponse({ verdict } satisfies VerifyResponse))
      .catch((e) => sendResponse({ error: String(e?.message ?? e) } satisfies VerifyResponse))
    return true // keep the channel open for the async response
  }
  if (msg?.type === 'status') {
    status().then(sendResponse)
    return true
  }
})
