import "server-only";
import { createHash, timingSafeEqual, webcrypto } from "node:crypto";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) {
    throw new Error("SESSION_SECRET must contain at least 32 characters.");
  }
  return value;
}

function encode(bytes: Uint8Array) {
  return Buffer.from(bytes).toString("base64url");
}

function decode(value: string) {
  return new Uint8Array(Buffer.from(value, "base64url"));
}

async function encryptionKey() {
  const digest = createHash("sha256").update(secret()).digest();
  return webcrypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function seal(payload: Record<string, unknown>) {
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const data = encoder.encode(JSON.stringify(payload));
  const encrypted = await webcrypto.subtle.encrypt({ name: "AES-GCM", iv }, await encryptionKey(), data);
  return `${encode(iv)}.${encode(new Uint8Array(encrypted))}`;
}

export async function unseal<T>(value?: string): Promise<T | null> {
  if (!value) return null;
  try {
    const [iv, encrypted] = value.split(".");
    if (!iv || !encrypted) return null;
    const decrypted = await webcrypto.subtle.decrypt(
      { name: "AES-GCM", iv: decode(iv) },
      await encryptionKey(),
      decode(encrypted),
    );
    return JSON.parse(decoder.decode(decrypted)) as T;
  } catch {
    return null;
  }
}

export function safeEqual(left: string, right: string) {
  const leftHash = createHash("sha256").update(left).digest();
  const rightHash = createHash("sha256").update(right).digest();
  return timingSafeEqual(leftHash, rightHash);
}
