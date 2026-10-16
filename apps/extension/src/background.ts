import type { Verdict } from '@xattest/core'
import type { VerifyRequest, VerifyResponse } from './messages.ts'

declare const __XATTEST_API_URL__: string // injected by build.mjs
const API_URL = __XATTEST_API_URL__
const HANDLES_TTL_MS = 5 * 60_000
// Unattested/invalid verdicts can change (e.g. a replay gets detected later), so don't keep them long.
const VERDICT_TTL_MS: Record<Verdict['status'], number> = {
  attested: 60 * 60_000,
  replayed: 60 * 60_000,
  'pre-registration': 60 * 60_000,
  unregistered: 5 * 60_000,
  unattested: 60_000,
  invalid: 60_000,
}

let handles: { at: number; set: Set<string> } | null = null
let handlesInFlight: Promise<Set<string>> | null = null
const verdicts = new Map<string, { at: number; verdict: Verdict }>()
const inFlight = new Map<string, Promise<Verdict>>()

async function registeredHandles(): Promise<Set<string>> {
  if (handles && Date.now() - handles.at < HANDLES_TTL_MS) return handles.set
  handlesInFlight ??= fetch(`${API_URL}/handles`)
    .then((r) => r.json() as Promise<{ handles: string[] }>)
    .then(({ handles: list }) => {
      handles = { at: Date.now(), set: new Set(list) }
      return handles.set
    })
    .finally(() => (handlesInFlight = null))
  return handlesInFlight
}

async function verify(tweetId: string, handle: string): Promise<Verdict> {
  // Skip the network for accounts that never registered: that's almost every tweet.
  if (!(await registeredHandles()).has(handle.toLowerCase())) return { status: 'unregistered' }

  const hit = verdicts.get(tweetId)
  if (hit && Date.now() - hit.at < VERDICT_TTL_MS[hit.verdict.status]) return hit.verdict

  let pending = inFlight.get(tweetId)
  if (!pending) {
    pending = fetch(`${API_URL}/verify?tweetId=${tweetId}`)
      .then(async (r) => {
        const body = await r.json()
        if (!r.ok) throw new Error(body.error ?? `verify failed (${r.status})`)
        verdicts.set(tweetId, { at: Date.now(), verdict: body.verdict })
        return body.verdict as Verdict
      })
      .finally(() => inFlight.delete(tweetId))
    inFlight.set(tweetId, pending)
  }
  return pending
}

chrome.runtime.onMessage.addListener((msg: VerifyRequest, _sender, sendResponse: (r: VerifyResponse) => void) => {
  if (msg?.type !== 'verify') return
  verify(msg.tweetId, msg.handle)
    .then((verdict) => sendResponse({ verdict }))
    .catch((e) => sendResponse({ error: String(e?.message ?? e) }))
  return true // keep the channel open for the async response
})
