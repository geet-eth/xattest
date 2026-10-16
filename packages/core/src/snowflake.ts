const TWITTER_EPOCH = 1288834974657n

/** Post time (ms) encoded in a tweet ID. Set by X, so the poster can't fake it. */
export function tweetIdToMs(id: string): number {
  return Number((BigInt(id) >> 22n) + TWITTER_EPOCH)
}

export function compareTweetIds(a: string, b: string): number {
  const x = BigInt(a)
  const y = BigInt(b)
  return x < y ? -1 : x > y ? 1 : 0
}
