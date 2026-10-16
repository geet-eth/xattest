import type { Metadata } from 'next'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { Providers } from './providers'
import { Wallet } from '@/components/Wallet'
import { network } from '@/lib/network'
import './globals.css'

export const metadata: Metadata = {
  title: 'xattest',
  description: 'Sign your posts with a wallet so anyone can tell they really came from you.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <header>
            <Link href="/" className="brand">✓ xattest</Link>
            <nav>
              <Link href="/">Compose</Link>
              <Link href="/register">Register</Link>
              <Link href="/verify">Verify</Link>
            </nav>
            {network.name !== 'base' && <span className="pill">{network.name}</span>}
            <Wallet />
          </header>
          <main>{children}</main>
        </Providers>
      </body>
    </html>
  )
}
