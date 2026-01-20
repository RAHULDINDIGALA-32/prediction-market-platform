import crypto from 'crypto';

/**
 * Encryption utilities for sensitive data (e.g., private keys)
 * Uses AES-256-GCM for authenticated encryption
 */

const ALGORITHM = 'aes-256-gcm';
const ENCODING = 'hex';

/**
 * Encrypt sensitive data
 * @param plaintext Data to encrypt
 * @param encryptionKey 32-byte hex key (use process.env.NEXT_PUBLIC_ENCRYPTION_KEY)
 * @returns Encrypted data with nonce: "nonce:encrypted:authTag"
 */
export function encrypt(plaintext: string, encryptionKey: string): string {
  // Validate key length (256-bit = 32 bytes = 64 hex characters)
  if (encryptionKey.length !== 64) {
    throw new Error('Encryption key must be 256-bit (64 hex characters)');
  }

  const key = Buffer.from(encryptionKey, ENCODING);
  const nonce = crypto.randomBytes(12); // 96-bit nonce for GCM
  
  const cipher = crypto.createCipheriv(ALGORITHM, key, nonce);
  
  let encrypted = cipher.update(plaintext, 'utf8', ENCODING);
  encrypted += cipher.final(ENCODING);
  
  const authTag = cipher.getAuthTag();
  
  // Format: nonce:encrypted:authTag (all hex)
  return `${nonce.toString(ENCODING)}:${encrypted}:${authTag.toString(ENCODING)}`;
}

/**
 * Decrypt sensitive data
 * @param ciphertext Encrypted data in format "nonce:encrypted:authTag"
 * @param encryptionKey 32-byte hex key (use process.env.ENCRYPTION_KEY)
 * @returns Decrypted plaintext
 */
export function decrypt(ciphertext: string, encryptionKey: string): string {
  // Validate key length
  if (encryptionKey.length !== 64) {
    throw new Error('Encryption key must be 256-bit (64 hex characters)');
  }

  const key = Buffer.from(encryptionKey, ENCODING);
  const parts = ciphertext.split(':');
  
  if (parts.length !== 3) {
    throw new Error('Invalid ciphertext format. Expected "nonce:encrypted:authTag"');
  }

  const nonce = Buffer.from(parts[0], ENCODING);
  const encrypted = parts[1];
  const authTag = Buffer.from(parts[2], ENCODING);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, nonce);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encrypted, ENCODING, 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

/**
 * Generate a random 256-bit encryption key (for setup)
 * @returns 64-character hex string
 */
export function generateEncryptionKey(): string {
  return crypto.randomBytes(32).toString(ENCODING);
}

/**
 * Validate private key format (Ethereum)
 * @param privateKey Private key with or without 0x prefix
 * @returns Normalized private key (lowercase, without 0x)
 */
export function validateAndNormalizePrivateKey(privateKey: string): string {
  let normalized = privateKey.trim();
  
  // Remove 0x prefix if present
  if (normalized.startsWith('0x')) {
    normalized = normalized.slice(2);
  }
  
  // Check length (256-bit = 64 hex characters)
  if (normalized.length !== 64) {
    throw new Error('Private key must be 256-bit (64 hex characters)');
  }
  
  // Check if valid hex
  if (!/^[0-9a-f]{64}$/i.test(normalized)) {
    throw new Error('Private key must contain only hexadecimal characters');
  }
  
  return normalized.toLowerCase();
}
