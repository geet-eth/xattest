import type { Hex } from 'viem'

export const TAG_MARK = '✓'
export const TAG_HEX_LENGTH = 6

export type ParsedTag = { tag: string; index: number; total: number }

export function tagFromUid(uid: Hex): string {
  return uid.slice(2, 2 + TAG_HEX_LENGTH).toLowerCase()
}

/** "✓ 3e1a9c" for a single post, "✓ 3e1a9c · 2/5" for a thread. index is 1-based. */
export function formatTag(tag: string, index: number, total: number): string {
  return total === 1 ? `${TAG_MARK} ${tag}` : `${TAG_MARK} ${tag} · ${index}/${total}`
}

export function appendTag(body: string, tagLine: string): string {
  return `${body.trimEnd()}\n\n${tagLine}`
}

const TAG_LINE_RE = new RegExp(`(?:^|\\n)\\s*${TAG_MARK} ([0-9a-f]{${TAG_HEX_LENGTH}})(?: · (\\d+)/(\\d+))?\\s*$`, 'i')

/** Splits a post into its body and trailing tag. Returns null when there's no tag. */
export function parseTag(text: string): (ParsedTag & { body: string }) | null {
  const m = TAG_LINE_RE.exec(text)
  if (!m) return null
  const total = m[3] ? Number(m[3]) : 1
  const index = m[2] ? Number(m[2]) : 1
  if (index < 1 || index > total) return null
  return { tag: m[1].toLowerCase(), index, total, body: text.slice(0, m.index) }
}
