import { createConfig, http } from 'wagmi'
import { injected } from 'wagmi/connectors'
import { base, baseSepolia } from 'wagmi/chains'
import { chain } from './network'

// Attestations are signed against EAS's EIP-712 domain on one chain, so wallets must be on it to sign.
export const config = createConfig({
  chains: [chain],
  connectors: [injected()],
  transports: { [base.id]: http(), [baseSepolia.id]: http() },
  ssr: true,
})

declare module 'wagmi' {
  interface Register {
    config: typeof config
  }
}
