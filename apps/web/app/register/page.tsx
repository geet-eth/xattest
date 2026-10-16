'use client'
import { useState } from 'react'
import { isAddress, type Address } from 'viem'
import { normalizeHandle, prepareBinding, tweetIdFromUrl, tweetIntentUrl, type AttestationEnvelope, type Registration } from '@xattest/core'
import { api } from '@/lib/api'
import { useSigner } from '@/lib/useSigner'

export default function Register() {
  const { address, sign } = useSigner()
  const [handle, setHandle] = useState('')
  const [registration, setRegistration] = useState<Registration | null | undefined>()
  const [newKey, setNewKey] = useState('')
  const [pending, setPending] = useState<{ envelope: AttestationEnvelope; proofText: string } | null>(null)
  const [proofUrl, setProofUrl] = useState('')
  const [done, setDone] = useState<Registration | null>(null)
  const [error, setError] = useState('')

  const h = normalizeHandle(handle)

  async function run(fn: () => Promise<void>) {
    setError('')
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const lookup = () => run(async () => setRegistration(await api.registration(h).catch(() => null)))

  // First key: the wallet signs its own binding, then the account proves it by posting the tag.
  const signFirstKey = () =>
    run(async () => {
      const prepared = prepareBinding({ handle: h, key: address as Address })
      setPending({ envelope: await sign(prepared), proofText: prepared.proofText })
    })

  const submitProof = () =>
    run(async () => {
      const id = tweetIdFromUrl(proofUrl)
      if (!id || !pending) throw new Error('paste the link to your proof post')
      setDone(await api.bind(pending.envelope, id))
    })

  // Extra keys: an active key signs for the new one. No post needed, so a hijacked account can't add keys.
  const addKey = () =>
    run(async () => {
      if (!isAddress(newKey)) throw new Error('not an address')
      setDone(await api.bind(await sign(prepareBinding({ handle: h, key: newKey }))))
    })

  if (done) {
    return (
      <section>
        <h1>@{done.handle} is registered</h1>
        <p>Posts from this account are now expected to carry a tag. Active keys:</p>
        <ul>{done.keys.filter((k) => !k.revokedAtMs).map((k) => <li key={k.address}><code>{k.address}</code></li>)}</ul>
      </section>
    )
  }

  return (
    <section>
      <h1>Register an account</h1>
      <label>
        Account
        <div className="row">
          <input placeholder="@handle" value={handle} onChange={(e) => { setHandle(e.target.value); setRegistration(undefined); setPending(null) }} />
          <button className="ghost" disabled={!h} onClick={lookup}>Check</button>
        </div>
      </label>

      {registration === null && !pending && (
        <>
          <p className="muted">
            Not registered yet. Your connected wallet becomes the first signing key. You&apos;ll post one proof from
            @{h} so we know the account agrees.
          </p>
          <button disabled={!address} onClick={signFirstKey}>{address ? 'Sign binding' : 'Connect a wallet'}</button>
        </>
      )}

      {pending && (
        <ol className="steps">
          <li>
            <pre>{pending.proofText}</pre>
            <a className="button" href={tweetIntentUrl(pending.proofText)} target="_blank" rel="noreferrer">Post proof on X</a>
          </li>
          <li>
            <input placeholder="Link to your proof post" value={proofUrl} onChange={(e) => setProofUrl(e.target.value)} />
            <button disabled={!proofUrl} onClick={submitProof}>Verify & register</button>
          </li>
        </ol>
      )}

      {registration && (
        <>
          <p>@{registration.handle} is registered with {registration.keys.filter((k) => !k.revokedAtMs).length} active key(s).</p>
          <h2>Add a key</h2>
          <p className="muted">Connect an existing key for this account, then enter the new address (for example a teammate or a Safe).</p>
          <div className="row">
            <input placeholder="0x…" value={newKey} onChange={(e) => setNewKey(e.target.value)} />
            <button disabled={!address || !newKey} onClick={addKey}>Sign & add</button>
          </div>
        </>
      )}
      {error && <p className="error">{error}</p>}
    </section>
  )
}
