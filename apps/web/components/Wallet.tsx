'use client'
import { useConnect, useConnection, useConnectors, useDisconnect } from 'wagmi'

export function Wallet() {
  const { address, isConnected } = useConnection()
  const connectors = useConnectors()
  const { mutate: connect, isPending } = useConnect()
  const { mutate: disconnect } = useDisconnect()

  if (isConnected && address) {
    return (
      <button className="ghost" onClick={() => disconnect()} title="Disconnect">
        {address.slice(0, 6)}…{address.slice(-4)}
      </button>
    )
  }
  const connector = connectors[0]
  return (
    <button disabled={!connector || isPending} onClick={() => connector && connect({ connector })}>
      {isPending ? 'Connecting…' : 'Connect wallet'}
    </button>
  )
}
