import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "crypto"
import { promisify } from "util"

const scrypt = promisify(scryptCb) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>

export const MIN_PASSWORD_LENGTH = 8

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const hash = await scrypt(password, salt, 64)
  return `scrypt:${salt.toString("base64")}:${hash.toString("base64")}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, salt, hash] = stored.split(":")
  if (alg !== "scrypt" || !salt || !hash) return false
  const expected = Buffer.from(hash, "base64")
  const actual = await scrypt(password, Buffer.from(salt, "base64"), expected.length)
  return timingSafeEqual(actual, expected)
}
