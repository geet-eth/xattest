# xattest

Sign posts on X with a wallet **before** they go out, so anyone can tell a post really came from the account owner, and spot one that didn't (for example after an account takeover).

Each signed post ends with a short tag:

```
Our v2 contracts are live. Docs: https://example.com/docs

✓ 3e1a9c · 2/3
```

People without the extension can see the tag and check it on the verify page. The browser extension checks every post from registered accounts automatically and flags anything unsigned.

## How it works

1. **Register (once).** A wallet signs a binding to `@handle`, and the account posts a proof containing that binding's tag. After that, posts from the account are expected to be signed. Adding more keys (teammates, a Safe) needs a signature from an existing key, never just a post, so a hijacked account can't add its own key.
2. **Compose.** Write the post or thread, and sign one [EAS](https://attest.org) offchain attestation covering the hash of every post. The API stores it, and only *then* does the app give you the post links. The attestation always exists before the post.
3. **Verify.** For a post from a registered account, the API fetches it from X, strips the tag, hashes the text and checks:
   - the hash matches the signed post at that position
   - the signer is an active key for that handle
   - the post went out after the attestation was published and before it expired; the post time comes from the tweet ID, which X sets
   - this is the earliest post using that attestation, so later copies show as **replayed**

| Verdict | Meaning |
| --- | --- |
| ✅ `attested` | Signed by a registered key, text matches |
| ⚠️ `unattested` | Account is registered but this post has no tag. Possibly not from the owner |
| ❌ `invalid` | Has a tag, but a check failed (edited text, expired, wrong key, …) |
| ❌ `replayed` | Copy of an earlier signed post |
| — `unregistered` / `pre-registration` | No badge |

Attestations use EAS's offchain format (v2), so they can be checked with the EAS SDK or opened on easscan (the verify page links there). Schemas:

- post: `string handle,bytes32[] posts`
- binding: `string handle` (recipient = the key)

## Layout

```
packages/core      shared logic: EAS typed data, normalization/hashing, tags, verdicts (+ tests)
apps/api           Hono API: bindings, attestations, /verify (fetches posts from X itself)
apps/web           Next.js + wagmi: compose, register, verify
apps/extension     Chrome MV3 extension: badges posts on x.com
```

## Develop

Node 24 (any version from 22 up should work).

```bash
npm install
npm test               # core tests, including a cross-check against eas-sdk
npm run dev:api        # http://localhost:8787  (data in apps/api/data/db.json)
npm run dev:web        # http://localhost:3000
npm run build:ext      # then load apps/extension/dist as an unpacked extension
```

Env:

- `apps/api`: `XATTEST_NETWORK` (`base-sepolia` default, or `base`), `PORT`, `DATA_PATH` (default `data/<network>.json`), `LOG_PATH`, `RPC_URL` (used for EIP-1271 smart-wallet signatures)
- `apps/web`: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_XATTEST_NETWORK` (must match the API)

The EIP-712 domain differs per chain (EAS is `1.0.1` on Base, `1.2.0` on Base Sepolia), so the API rejects attestations signed for the other network. Schemas are registered once per chain; the first registration in the web app does it: one batched call (EIP-5792) if the wallet supports batching natively, otherwise one transaction per schema.
- extension build: `XATTEST_API_URL`. Also add the production API origin to `host_permissions` in `apps/extension/public/manifest.json`.

## Known gaps / next up

- **Backdating after a key leak.** `receivedAtMs` is our server's clock. Anchor attestation UIDs on Base with EAS `timestamp()` (batched) so the ordering is publicly checkable.
- **Revocation and key recovery.** There are no endpoints yet. Recovery should be a time-delayed proof post that active keys can veto.
- **Storage.** It's a JSON file; move to Postgres before launch. Add rate limiting.
- **Fetching posts.** It uses X's unofficial syndication endpoint (`apps/api/src/twitter.ts`), which can change or rate-limit. Fall back to the official API if needed.
- **Normalization.** Build fixtures from real posts: emoji, long posts, quote posts, media, edits.
- **Thread continuity.** Check that part *n* replies to part *n-1*.
