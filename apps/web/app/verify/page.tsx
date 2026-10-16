'use client'
import { useState } from 'react'
import { tweetIdFromUrl, type Verdict } from '@xattest/core'
import { api } from '@/lib/api'
import { VerdictBadge } from '@/components/VerdictBadge'

export default function Verify() {
  const [url, setUrl] = useState('')
  const [result, setResult] = useState<{ handle: string; verdict: Verdict; easscanUrl?: string } | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function check() {
    setError('')
    setResult(null)
    const id = tweetIdFromUrl(url) ?? (/^\d+$/.test(url.trim()) ? url.trim() : null)
    if (!id) return setError('paste a post link like x.com/name/status/123')
    setBusy(true)
    try {
      setResult(await api.verify(id))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section>
      <h1>Verify a post</h1>
      <div className="row">
        <input placeholder="https://x.com/name/status/…" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && check()} />
        <button disabled={busy || !url} onClick={check}>{busy ? 'Checking…' : 'Check'}</button>
      </div>
      {result && (
        <>
          <p className="muted">@{result.handle}</p>
          <VerdictBadge verdict={result.verdict} />
          {result.easscanUrl && (
            <p>
              <a href={result.easscanUrl} target="_blank" rel="noreferrer">View attestation on EAS ↗</a>
            </p>
          )}
        </>
      )}
      {error && <p className="error">{error}</p>}
    </section>
  )
}
