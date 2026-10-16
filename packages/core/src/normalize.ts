import { keccak256, stringToBytes, type Hex } from 'viem'

const ZERO_WIDTH = /[​-‍⁠﻿]/g
const URL_RE = /\bhttps?:\/\/[^\s]+/gi

function normalizeUrl(url: string): string {
  const stripped = url.replace(/^https?:\/\//i, '').replace(/^www\./i, '')
  const slash = stripped.indexOf('/')
  const host = (slash === -1 ? stripped : stripped.slice(0, slash)).toLowerCase()
  const rest = slash === -1 ? '' : stripped.slice(slash)
  return (host + rest).replace(/\/+$/, '')
}

/**
 * Canonical form of a post's text, so the composer and the copy fetched back from X hash the same.
 * X rewrites links to t.co, so fetched text must have its links expanded before calling this.
 */
export function normalizeText(text: string): string {
  return text
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .replace(ZERO_WIDTH, '')
    .replace(URL_RE, normalizeUrl)
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function hashPost(text: string): Hex {
  return keccak256(stringToBytes(normalizeText(text)))
}

export function normalizeHandle(handle: string): string {
  return handle.trim().replace(/^@/, '').toLowerCase()
}

/**
 * Approximate X weighted length: links count 23, most Latin/punctuation counts 1, everything else
 * (CJK, emoji, symbols like ✓) counts 2. Max is 280.
 */
export function weightedLength(text: string): number {
  let n = 0
  const withoutUrls = text.normalize('NFC').replace(URL_RE, () => {
    n += 23
    return ''
  })
  for (const ch of withoutUrls) {
    const cp = ch.codePointAt(0)!
    const light =
      cp <= 0x10ff || (cp >= 0x2000 && cp <= 0x200d) || (cp >= 0x2010 && cp <= 0x201f) || (cp >= 0x2032 && cp <= 0x2037)
    n += light ? 1 : 2
  }
  return n
}

export const MAX_TWEET_LENGTH = 280
