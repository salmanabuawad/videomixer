import crypto from 'crypto';

const keySource = process.env.ENCRYPTION_KEY || 'change_this_to_a_long_random_secret_32_chars';
const key = crypto.createHash('sha256').update(keySource).digest();
const ivLength = 16;

export function encryptValue(plainText) {
  const iv = crypto.randomBytes(ivLength);
  const cipher = crypto.createCipheriv('aes-256-ctr', key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptValue(encryptedText) {
  const [ivHex, contentHex] = encryptedText.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const content = Buffer.from(contentHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-ctr', key, iv);
  const decrypted = Buffer.concat([decipher.update(content), decipher.final()]);
  return decrypted.toString('utf8');
}
