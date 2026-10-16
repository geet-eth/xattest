import type { Status, StatusRequest } from './messages.ts'

const TONE: Record<string, string> = {
  attested: 'ok', 'registration-proof': 'ok', unattested: 'warn', invalid: 'bad', replayed: 'bad',
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`)

chrome.runtime.sendMessage({ type: 'status' } satisfies StatusRequest, (s: Status) => {
  const out = document.getElementById('out')!
  const api = s.api.ok
    ? `<span class="ok">Connected</span> · ${esc(s.api.network)}`
    : `<span class="bad">Can't reach API</span><br><span class="muted">${esc(s.api.error)}</span>`
  const handles = s.handles.length
    ? `<ul>${s.handles.map((h) => `<li>@${esc(h)}</li>`).join('')}</ul>`
    : `<span class="warn">None yet.</span> <span class="muted">Posts only get badges once their account is registered.</span>`
  const recent = s.recent.length
    ? `<ul>${s.recent.map((r) => `<li><span class="${TONE[r.status] ?? 'muted'}">${esc(r.status)}</span> @${esc(r.handle)} <a href="https://x.com/i/status/${r.tweetId}" target="_blank">post</a></li>`).join('')}</ul>`
    : '<span class="muted">Nothing checked yet.</span>'
  out.className = ''
  out.innerHTML = `
    <div>${api}</div>
    <div class="muted"><code>${esc(s.apiUrl)}</code></div>
    <h2>Registered accounts</h2>${handles}
    <h2>Recent checks</h2>${recent}
    <p class="muted">${s.skipped} post(s) from unregistered accounts skipped this session.</p>`
})
