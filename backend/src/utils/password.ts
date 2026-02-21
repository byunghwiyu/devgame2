import crypto from "node:crypto";

const SCRYPT_KEYLEN = 64;

function scrypt(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, SCRYPT_KEYLEN, (err, key) => {
      if (err) return reject(err);
      resolve(key as Buffer);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString("hex");
  const key = await scrypt(password, salt);
  return `${salt}:${key.toString("hex")}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [salt, hashHex] = encoded.split(":");
  if (!salt || !hashHex) return false;

  const expected = Buffer.from(hashHex, "hex");
  const actual = await scrypt(password, salt);
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}
