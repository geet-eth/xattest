import type { Verdict } from '@xattest/core'

export type VerifyRequest = { type: 'verify'; tweetId: string; handle: string }
export type VerifyResponse = { verdict: Verdict } | { error: string }
