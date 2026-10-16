import type { Verdict } from '@xattest/core'
import type { VerifyRequest, VerifyResponse } from './messages.ts'

// X's markup changes often; keep every selector here. Two layouts exist: the older one with
// data-testid="tweet" and a <time> inside the permalink, and the newer one with plain <article>
// and the date as link text. Match both.
const TWEET = 'article'
const STATUS_LINK = 'a[href*="/status/"]'
const PERMALINK_PATH = /^\/([A-Za-z0-9_]{1,15})\/status\/(\d+)\/?$/
const BADGE_CLASS = 'xattest-badge'

const BADGES: Partial<Record<Verdict['status'], { icon: string; tone: string; title: (v: Verdict) => string }>> = {
  attested: {
    icon: '✓ signed',
    tone: 'ok',
    title: (v) => (v.status === 'attested' ? `Signed by ${v.signer} (post ${v.index}/${v.total})` : ''),
  },
  'registration-proof': {
    icon: '✓ key proof',
    tone: 'ok',
    title: (v) => (v.status === 'registration-proof' ? `Links signing key ${v.key} to this account` : ''),
  },
  unattested: {
    icon: '⚠ unsigned',
    tone: 'warn',
    title: () => 'This account signs its posts, but this one is not signed. It may not be from the account owner.',
  },
  invalid: {
    icon: '✕ bad signature',
    tone: 'bad',
    title: (v) => (v.status === 'invalid' ? `Attestation check failed: ${v.reason}` : ''),
  },
  replayed: {
    icon: '✕ copied',
    tone: 'bad',
    title: (v) => (v.status === 'replayed' ? `Copy of an earlier signed post (${v.originalTweetId})` : ''),
  },
}

/** The post's own permalink: the date link (prefer one wrapping <time>), not photo/analytics/quote links. */
function parsePermalink(article: Element): { handle: string; tweetId: string; anchor: Element } | null {
  const links = [...article.querySelectorAll<HTMLAnchorElement>(STATUS_LINK)].filter(
    (a) => a.closest(TWEET) === article && PERMALINK_PATH.test(new URL(a.href).pathname),
  )
  const a = links.find((l) => l.querySelector('time')) ?? links[0]
  const m = a && PERMALINK_PATH.exec(new URL(a.href).pathname)
  return m ? { handle: m[1], tweetId: m[2], anchor: a } : null
}

function render(article: HTMLElement, anchor: Element, verdict: Verdict) {
  article.querySelector(`.${BADGE_CLASS}`)?.remove()
  article.classList.remove('xattest-flagged', 'xattest-unattested')
  const badge = BADGES[verdict.status]
  if (!badge) return
  const el = document.createElement('span')
  el.className = `${BADGE_CLASS} ${badge.tone}`
  el.textContent = badge.icon
  el.title = badge.title(verdict)
  anchor.after(el)
  if (badge.tone === 'bad') article.classList.add('xattest-flagged')
  if (badge.tone === 'warn') article.classList.add('xattest-unattested')
}

function check(article: HTMLElement) {
  const info = parsePermalink(article)
  // X recycles article nodes while scrolling, so track which tweet each one was checked for.
  if (!info || article.dataset.xattestId === info.tweetId) return
  article.dataset.xattestId = info.tweetId
  article.querySelector(`.${BADGE_CLASS}`)?.remove()

  const req: VerifyRequest = { type: 'verify', tweetId: info.tweetId, handle: info.handle }
  chrome.runtime.sendMessage(req, (res: VerifyResponse | undefined) => {
    if (chrome.runtime.lastError || !res || 'error' in res) return
    if (article.dataset.xattestId !== info.tweetId) return // node was reused meanwhile
    render(article, info.anchor, res.verdict)
  })
}

function scan(root: ParentNode) {
  root.querySelectorAll<HTMLElement>(TWEET).forEach(check)
}

let queued = false
new MutationObserver(() => {
  if (queued) return
  queued = true
  requestAnimationFrame(() => {
    queued = false
    scan(document)
  })
}).observe(document.body, { childList: true, subtree: true })

scan(document)
