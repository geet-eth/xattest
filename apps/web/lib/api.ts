import type { AttestationEnvelope, Registration, Verdict } from '@xattest/core'

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787'

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error ?? `request failed (${res.status})`)
  return body as T
}

export const api = {
  registration: (handle: string) => call<Registration>(`/registrations/${encodeURIComponent(handle)}`),
  publish: (envelope: AttestationEnvelope) =>
    call<{ uid: string; tag: string; receivedAtMs: number }>('/attestations', { method: 'POST', body: JSON.stringify({ envelope }) }),
  bind: (envelope: AttestationEnvelope, proofTweetId?: string) =>
    call<Registration>('/bindings', { method: 'POST', body: JSON.stringify({ envelope, proofTweetId }) }),
  verify: (tweetId: string) => call<{ tweetId: string; handle: string; verdict: Verdict }>(`/verify?tweetId=${tweetId}`),
}
