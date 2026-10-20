import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto"

const PREFIX = "enc:v1:"

function getKey(): Buffer {
  const secret = process.env.NEXTAUTH_SECRET
  if (!secret) throw new Error("NEXTAUTH_SECRET must be set to store secrets")
  return createHash("sha256").update(secret).digest()
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv)
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()])
  return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64")
}

// Values saved before encryption was added are returned as-is.
export function decryptSecret(stored: string): string {
  if (!stored.startsWith(PREFIX)) return stored
  const raw = Buffer.from(stored.slice(PREFIX.length), "base64")
  const decipher = createDecipheriv("aes-256-gcm", getKey(), raw.subarray(0, 12))
  decipher.setAuthTag(raw.subarray(12, 28))
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8")
}
