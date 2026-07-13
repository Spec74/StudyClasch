import crypto from 'crypto';

const SALT_BYTES = 16;
const KEY_LENGTH = 64;
const DIGEST = 'sha512';

function scryptAsync(password: string, salt: string) {
  return new Promise<string>((resolve, reject) => {
    crypto.scrypt(password, salt, KEY_LENGTH, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(derivedKey.toString('hex'));
    });
  });
}

export async function hashPassword(password: string) {
  const salt = crypto.randomBytes(SALT_BYTES).toString('hex');
  const hash = await scryptAsync(password, salt);
  return `${salt}:${hash}`;
}

export async function verifyPassword(password: string, storedHash?: string) {
  if (!storedHash || typeof storedHash !== 'string') {
    return false;
  }

  const [salt, hash] = storedHash.split(':');
  if (!salt || !hash) {
    return false;
  }

  const nextHash = await scryptAsync(password, salt);
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(nextHash, 'hex'));
}
