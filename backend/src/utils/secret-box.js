'use strict';
/**
 * تشفير/فك تشفير المفاتيح السرية (AES-256-GCM).
 * المفتاح يُشتق من SETTINGS_ENC_KEY أو JWT_SECRET.
 * صيغة المخرَج: base64(iv[12] + tag[16] + ciphertext)
 */
const crypto = require('crypto');

const getKey = () => {
  const raw = process.env.SETTINGS_ENC_KEY || process.env.JWT_SECRET;
  if (!raw || raw.length < 16) {
    throw new Error('SETTINGS_ENC_KEY أو JWT_SECRET غير معرّف أو قصير');
  }
  return crypto.createHash('sha256').update(String(raw)).digest();
};

const encrypt = (plaintext) => {
  if (plaintext == null || plaintext === '') return '';
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([
    cipher.update(String(plaintext), 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString('base64');
};

const decrypt = (b64) => {
  if (!b64) return '';
  try {
    const buf = Buffer.from(b64, 'base64');
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const ct = buf.subarray(28);
    const key = getKey();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
  } catch (e) {
    return null; // فك التشفير فشل (المفتاح تغيّر)
  }
};

const mask = (value) => {
  if (!value) return '';
  const s = String(value);
  if (s.length <= 4) return '••••';
  return '••••' + s.slice(-4);
};

const isSecretField = (name) => {
  const n = String(name).toLowerCase();
  return n.includes('secret') || n.includes('key') ||
         n.includes('token') || n.includes('password') ||
         n.includes('sid') || n.includes('auth');
};

module.exports = { encrypt, decrypt, mask, isSecretField };
