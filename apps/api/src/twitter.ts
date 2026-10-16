import { normalizeHandle, type Tweet } from '@xattest/core'

// X's public embed endpoint (what embedded tweets use). No API key, but unofficial: it can change
// or rate-limit, so everything goes through this one function and its cache.
const SYNDICATION_URL = 'https://cdn.syndication.twimg.com/tweet-result'

type SyndicationUrl = { url: string; expanded_url: string }
type SyndicationTweet = {
  __typename?: string
  id_str: string
  text: string
  user: { screen_name: string }
  entities?: { urls?: SyndicationUrl[]; media?: { url: string }[] }
  note_tweet?: { note_tweet_results?: { result?: { text: string; entity_set?: { urls?: SyndicationUrl[] } } } }
  in_reply_to_status_id_str?: string
}

export type FetchedTweet = Tweet & { inReplyTo?: string }

function token(id: string): string {
  return ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, '')
}

function decodeEntities(s: string): string {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
}

/** Rebuilds the text as the author typed it: t.co links expanded, attached-media links removed. */
export function expandText(t: SyndicationTweet): string {
  const note = t.note_tweet?.note_tweet_results?.result
  let text = note?.text ?? t.text
  const urls = note?.entity_set?.urls ?? t.entities?.urls ?? []
  for (const u of urls) text = text.split(u.url).join(u.expanded_url)
  for (const m of t.entities?.media ?? []) text = text.split(m.url).join('')
  return decodeEntities(text).trim()
}

const cache = new Map<string, { at: number; tweet: FetchedTweet | null }>()
const CACHE_MS = 5 * 60_000

export async function fetchTweet(id: string): Promise<FetchedTweet | null> {
  const hit = cache.get(id)
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.tweet

  const url = `${SYNDICATION_URL}?id=${id}&lang=en&token=${token(id)}`
  const res = await fetch(url, { headers: { 'user-agent': 'xattest/0.1' } })
  let tweet: FetchedTweet | null = null
  if (res.ok) {
    const body = (await res.json()) as SyndicationTweet
    if (body.__typename === 'Tweet' && body.id_str === id) {
      tweet = {
        id,
        handle: normalizeHandle(body.user.screen_name),
        text: expandText(body),
        inReplyTo: body.in_reply_to_status_id_str,
      }
    }
  } else if (res.status !== 404) {
    throw new Error(`syndication ${res.status}`)
  }
  cache.set(id, { at: Date.now(), tweet })
  return tweet
}
