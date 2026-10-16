import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs'
import { dirname } from 'node:path'
import type { Address } from 'viem'
import type { AttestationEnvelope, PostAttestation, Registration } from '@xattest/core'

export type StoredPost = PostAttestation & { envelope: AttestationEnvelope }
export type StoredBinding = { uid: string; handle: string; key: Address; envelope: AttestationEnvelope; proofTweetId?: string }

type Data = {
  registrations: Record<string, Registration>
  bindings: Record<string, StoredBinding>
  posts: Record<string, StoredPost>
  /** `${handle}:${tag}` -> uid */
  tags: Record<string, string>
  /** `${uid}:${index}` -> earliest tweet id seen for that post */
  claims: Record<string, string>
}

/**
 * JSON-file store. Fine for development and a single instance; swap for Postgres before launch.
 * Every method is synchronous so request handlers can't interleave between a read and a write.
 */
export class Store {
  private data: Data

  constructor(private path: string) {
    try {
      this.data = JSON.parse(readFileSync(path, 'utf8'))
    } catch {
      this.data = { registrations: {}, bindings: {}, posts: {}, tags: {}, claims: {} }
    }
  }

  private flush() {
    mkdirSync(dirname(this.path), { recursive: true })
    writeFileSync(`${this.path}.tmp`, JSON.stringify(this.data, null, 2))
    renameSync(`${this.path}.tmp`, this.path)
  }

  handles(): string[] {
    return Object.keys(this.data.registrations)
  }

  registration(handle: string): Registration | null {
    return this.data.registrations[handle] ?? null
  }

  putRegistration(reg: Registration, binding: StoredBinding) {
    this.data.registrations[reg.handle] = reg
    this.data.bindings[binding.uid] = binding
    this.flush()
  }

  /** The binding whose proof post is this tweet, if any. */
  bindingByProofTweet(tweetId: string): StoredBinding | null {
    return Object.values(this.data.bindings).find((b) => b.proofTweetId === tweetId) ?? null
  }

  post(uid: string): StoredPost | null {
    return this.data.posts[uid] ?? null
  }

  postByTag(handle: string, tag: string): StoredPost | null {
    const uid = this.data.tags[`${handle}:${tag}`]
    return uid ? this.post(uid) : null
  }

  /** Returns false if the handle already has a different attestation with this tag. */
  putPost(post: StoredPost): boolean {
    const key = `${post.handle}:${post.tag}`
    const existing = this.data.tags[key]
    if (existing) return existing === post.uid
    this.data.tags[key] = post.uid
    this.data.posts[post.uid] = post
    this.flush()
    return true
  }

  claim(uid: string, index: number): string | null {
    return this.data.claims[`${uid}:${index}`] ?? null
  }

  setClaim(uid: string, index: number, tweetId: string) {
    this.data.claims[`${uid}:${index}`] = tweetId
    this.flush()
  }
}
