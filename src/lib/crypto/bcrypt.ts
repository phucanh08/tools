// bcrypt via bcryptjs (pure JS; salts come from crypto.getRandomValues).
import bcrypt from 'bcryptjs'
import { utf8Encode } from '../encoding'

export const MIN_COST = 4
export const MAX_COST = 15

export function passwordByteLength(password: string): number {
  return utf8Encode(password).length
}

export async function bcryptHash(password: string, cost: number): Promise<string> {
  if (!Number.isInteger(cost) || cost < MIN_COST || cost > MAX_COST) {
    throw new Error(`Cost must be between ${MIN_COST} and ${MAX_COST}`)
  }
  return bcrypt.hash(password, cost)
}

export function isBcryptHash(hash: string): boolean {
  return /^\$2[abxy]?\$\d{2}\$[./A-Za-z0-9]{53}$/.test(hash.trim())
}

export async function bcryptVerify(password: string, hash: string): Promise<boolean> {
  const h = hash.trim()
  if (!isBcryptHash(h)) throw new Error('Not a valid bcrypt hash (expected $2a$/$2b$/$2y$ + cost + 53 chars)')
  const cost = bcryptCost(h)!
  // bcryptjs accepts up to 31 (2^31 rounds), which would lock the tab for hours.
  if (cost < MIN_COST || cost > MAX_COST) {
    throw new Error(`Unsupported cost ${cost}: this tool verifies costs ${MIN_COST}–${MAX_COST} only`)
  }
  return bcrypt.compare(password, h)
}

export function bcryptCost(hash: string): number | null {
  const m = /^\$2[abxy]?\$(\d{2})\$/.exec(hash.trim())
  return m ? Number(m[1]) : null
}
