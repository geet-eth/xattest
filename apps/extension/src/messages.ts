import type { Verdict } from '@xattest/core'

export type VerifyRequest = { type: 'verify'; tweetId: string; handle: string }
export type VerifyResponse = { verdict: Verdict } | { error: string }

export type StatusRequest = { type: 'status' }
export type Status = {
  apiUrl: string
  api: { ok: true; network: string } | { ok: false; error: string }
  handles: string[]
  /** Most recent verdicts for registered accounts, newest first. */
  recent: { tweetId: string; handle: string; status: Verdict['status']; at: number }[]
  /** Posts seen from accounts that aren't registered (no badge by design). */
  skipped: number
}
