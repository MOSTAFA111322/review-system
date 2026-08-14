import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const KEY_LENGTH = 64;
const N = 16_384;
const R = 8;
const P = 1;

function derive(password: string, salt: Buffer) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, { N, r: R, p: P, maxmem: 64 * 1024 * 1024 }, (error, key) => {
      if (error) reject(error);
      else resolve(key as Buffer);
    });
  });
}

/** تجزئة كلمة المرور بخوارزمية scrypt مع salt فريد لكل حساب. */
export async function hashLocalPassword(password: string) {
  const salt = randomBytes(16);
  const key = await derive(password, salt);
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

/** مقارنة آمنة زمنيًا؛ تعيد false عند صيغة تجزئة غير صالحة دون كشف السبب. */
export async function verifyLocalPassword(password: string, storedHash: string | null | undefined) {
  if (!storedHash) return false;
  const [algorithm, encodedN, encodedR, encodedP, encodedSalt, encodedKey] = storedHash.split("$");
  if (algorithm !== "scrypt" || !encodedN || !encodedR || !encodedP || !encodedSalt || !encodedKey) return false;
  const parsedN = Number(encodedN);
  const parsedR = Number(encodedR);
  const parsedP = Number(encodedP);
  if (parsedN !== N || parsedR !== R || parsedP !== P) return false;
  try {
    const expected = Buffer.from(encodedKey, "base64url");
    const actual = await derive(password, Buffer.from(encodedSalt, "base64url"));
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export function normalizeLocalUsername(username: string) {
  return username.trim().toLocaleLowerCase();
}
