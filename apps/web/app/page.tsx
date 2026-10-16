'use client'
import { useEffect, useState } from 'react'
import {
  MAX_TWEET_LENGTH, appendTag, formatTag, normalizeHandle, preparePosts, tweetIdFromUrl, tweetIntentUrl, weightedLength,
} from '@xattest/core'
import { api } from '@/lib/api'
import { useSigner } from '@/lib/useSigner'
import { network } from '@/lib/network'

type Published = { tag: string; texts: string[]; expiresAtMs: number }

export default function Compose() {
  const { address, sign } = useSigner()
  const [handle, setHandle] = useState('')
  const [posts, setPosts] = useState([''])
  const [published, setPublished] = useState<Published | null>(null)
  const [postedUrls, setPostedUrls] = useState<string[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const total = posts.length
  // Measure with a placeholder tag so the counter includes the tag line.
  const lengths = posts.map((p, i) => weightedLength(appendTag(p, formatTag('000000', i + 1, total))))
  const valid = normalizeHandle(handle) && posts.every((p, i) => p.trim() && lengths[i] <= MAX_TWEET_LENGTH)

  async function signAndPublish() {
    setError('')
    setBusy(true)
    try {
      const prepared = preparePosts({ network, handle, posts })
      const envelope = await sign(prepared)
      await api.publish(envelope)
      setPublished({ tag: prepared.tag, texts: prepared.texts, expiresAtMs: Number(prepared.typedData.message.expirationTime) * 1000 })
      setPostedUrls([])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  if (published) {
    return (
      <section>
        <h1>Signed and published</h1>
        <p className="muted">
          Tag <code>{published.tag}</code>. Post {total > 1 ? 'each part, in order,' : 'it'} before it expires:{' '}
          <Countdown until={published.expiresAtMs} />
        </p>
        <ol className="steps">
          {published.texts.map((text, i) => {
            const replyTo = i === 0 ? undefined : tweetIdFromUrl(postedUrls[i - 1] ?? '')
            const ready = i === 0 || !!replyTo
            return (
              <li key={i}>
                <pre>{text}</pre>
                {ready ? (
                  <a className="button" href={tweetIntentUrl(text, replyTo ?? undefined)} target="_blank" rel="noreferrer">
                    Post {total > 1 ? `${i + 1}/${total}` : ''} on X
                  </a>
                ) : (
                  <p className="muted">Paste the link to post {i} first.</p>
                )}
                {i < total - 1 && (
                  <input
                    placeholder={`Link to post ${i + 1} once it's up`}
                    value={postedUrls[i] ?? ''}
                    onChange={(e) => setPostedUrls((u) => Object.assign([...u], { [i]: e.target.value }))}
                  />
                )}
              </li>
            )
          })}
        </ol>
        <button className="ghost" onClick={() => setPublished(null)}>Write another</button>
      </section>
    )
  }

  return (
    <section>
      <h1>Compose</h1>
      <p className="muted">
        Your wallet signs the post before it goes out, and a short tag is added to the end. Anyone can check that
        tag; posts from your account without one get flagged.
      </p>
      <label>
        Account
        <input placeholder="@handle" value={handle} onChange={(e) => setHandle(e.target.value)} />
      </label>
      {posts.map((p, i) => (
        <div key={i} className="post">
          <textarea
            rows={4}
            placeholder={i === 0 ? "What's happening?" : 'Next post in the thread'}
            value={p}
            onChange={(e) => setPosts((ps) => ps.map((x, j) => (j === i ? e.target.value : x)))}
          />
          <div className="row">
            <span className={lengths[i] > MAX_TWEET_LENGTH ? 'over' : 'muted'}>
              {lengths[i]}/{MAX_TWEET_LENGTH} incl. tag
            </span>
            {total > 1 && (
              <button className="ghost" onClick={() => setPosts((ps) => ps.filter((_, j) => j !== i))}>Remove</button>
            )}
          </div>
        </div>
      ))}
      <div className="row">
        <button className="ghost" onClick={() => setPosts((ps) => [...ps, ''])}>+ Add to thread</button>
        <button disabled={!address || !valid || busy} onClick={signAndPublish}>
          {busy ? 'Waiting for signature…' : address ? 'Sign & publish' : 'Connect a wallet to sign'}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </section>
  )
}

function Countdown({ until }: { until: number }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const s = Math.max(0, Math.floor((until - now) / 1000))
  return <strong>{s === 0 ? 'expired, sign again' : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`}</strong>
}
