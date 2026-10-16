import { base, baseSepolia } from 'wagmi/chains'
import { getNetwork } from '@xattest/core'

// Must match the API's XATTEST_NETWORK, or the API rejects signatures for the wrong chain.
export const network = getNetwork(process.env.NEXT_PUBLIC_XATTEST_NETWORK)
export const chain = network.name === 'base' ? base : baseSepolia
