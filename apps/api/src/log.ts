import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

const LOG_PATH = process.env.LOG_PATH ?? 'data/api.log'
mkdirSync(dirname(LOG_PATH), { recursive: true })

/** One line per event, to stdout and to LOG_PATH so other tools can tail it. */
export function log(event: string, fields: Record<string, unknown> = {}) {
  const line = JSON.stringify({ t: new Date().toISOString(), event, ...fields })
  console.log(line)
  appendFileSync(LOG_PATH, `${line}\n`)
}
