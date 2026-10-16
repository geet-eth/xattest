import type { Verdict } from '@xattest/core'

const LABELS: Record<Verdict['status'], { icon: string; text: string; tone: string }> = {
  attested: { icon: '✅', text: 'Attested', tone: 'ok' },
  unattested: { icon: '⚠️', text: 'Not attested: this account signs its posts, this one isn’t signed', tone: 'warn' },
  invalid: { icon: '❌', text: 'Invalid attestation', tone: 'bad' },
  replayed: { icon: '❌', text: 'Copy of an earlier attested post', tone: 'bad' },
  unregistered: { icon: '·', text: 'This account doesn’t use xattest', tone: 'muted' },
  'pre-registration': { icon: '·', text: 'Posted before this account started signing', tone: 'muted' },
}

export function VerdictBadge({ verdict }: { verdict: Verdict }) {
  const l = LABELS[verdict.status]
  return (
    <div className={`verdict ${l.tone}`}>
      <strong>{l.icon} {l.text}</strong>
      {verdict.status === 'invalid' && <p>{verdict.reason}</p>}
      {verdict.status === 'attested' && (
        <p>
          Post {verdict.index} of {verdict.total}, signed by <code>{verdict.signer}</code>
        </p>
      )}
      {verdict.status === 'replayed' && (
        <p>
          Original: <a href={`https://x.com/i/status/${verdict.originalTweetId}`}>{verdict.originalTweetId}</a>
        </p>
      )}
    </div>
  )
}
