import { build, context } from 'esbuild'
import { cpSync, mkdirSync } from 'node:fs'

const watch = process.argv.includes('--watch')
mkdirSync('dist', { recursive: true })
cpSync('public', 'dist', { recursive: true })

const options = {
  entryPoints: ['src/content.ts', 'src/background.ts'],
  outdir: 'dist',
  bundle: true,
  format: 'esm',
  target: 'chrome120',
  define: { __XATTEST_API_URL__: JSON.stringify(process.env.XATTEST_API_URL ?? 'http://localhost:8787') },
  logLevel: 'info',
}

if (watch) await (await context(options)).watch()
else await build(options)
