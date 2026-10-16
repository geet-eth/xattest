import { createConfig, http } from 'wagmi'
import { base } from 'wagmi/chains'
import { injected } from 'wagmi/connectors'

// Attestations are signed against EAS's EIP-712 domain on Base, so wallets must be on Base to sign.
export const config = createConfig({
  chains: [base],
  connectors: [injected()],
  transports: { [base.id]: http() },
  ssr: true,
})

declare module 'wagmi' {
  interface Register {
    config: typeof config
  }
}
