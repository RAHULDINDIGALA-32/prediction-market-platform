/**
 * Signer Management - Handle private key encryption/decryption for quote signing
 * 
 * Private keys are:
 * - Stored encrypted in database
 * - Decrypted only when needed for signing
 * - Never logged or exposed
 * - Immediately discarded after use
 */

import { prisma } from './db';
import { decrypt } from './encryption';
import { ethers } from 'ethers';

/**
 * Get decrypted signer wallet for signing quotes
 * 
 * @param signerAddress Address of the signer
 * @returns Wallet instance ready for signing, or null if not found
 * @throws Error if decryption fails
 */
export async function getSignerWallet(signerAddress: string): Promise<ethers.Wallet | null> {
  const normalizedAddress = signerAddress.toLowerCase();

  // Fetch from database
  const signer = await prisma.authorizedSigner.findUnique({
    where: { address: normalizedAddress },
    select: {
      address: true,
      privateKey: true,
      isAllowed: true,
    },
  });

  // Not found or not allowed
  if (!signer || !signer.isAllowed || !signer.privateKey) {
    return null;
  }

  const encryptionKey = process.env.ENCRYPTION_KEY;
  if (!encryptionKey) {
    throw new Error('ENCRYPTION_KEY not configured');
  }

  let decryptedKey: string;
  try {
    decryptedKey = decrypt(signer.privateKey, encryptionKey);
  } catch (error) {
    console.error('Failed to decrypt signer private key:', (error as Error).message);
    throw new Error('Failed to decrypt signer credentials');
  }

  // Create wallet
  try {
    const wallet = new ethers.Wallet(decryptedKey);

    // Verify it matches the expected address
    if (wallet.address.toLowerCase() !== normalizedAddress) {
      throw new Error('Decrypted key does not match signer address');
    }

    // Return wallet
    // Note: decryptedKey is now only in this scope and will be garbage collected
    return wallet;
  } catch (error) {
    console.error('Failed to create wallet from private key:', (error as Error).message);
    throw new Error('Invalid signer credentials');
  }
}

/**
 * Check if a signer is authorized and can sign
 * 
 * @param signerAddress Address to check
 * @returns True if signer exists, is allowed, and has private key
 */
export async function isSignerAuthorized(signerAddress: string): Promise<boolean> {
  const normalizedAddress = signerAddress.toLowerCase();

  const signer = await prisma.authorizedSigner.findUnique({
    where: { address: normalizedAddress },
    select: { isAllowed: true, privateKey: true },
  });

  return signer?.isAllowed === true && !!signer?.privateKey;
}

/**
 * Sign a trade quote using signer's private key
 * 
 * @param signerAddress Address of the signer
 * @param messageHash The hash to sign (EIP-712 formatted)
 * @returns Signature string, or null if signer not found
 * @throws Error if signing fails
 */
export async function signTradeQuote(
  signerAddress: string,
  messageHash: string
): Promise<string | null> {
  const wallet = await getSignerWallet(signerAddress);

  if (!wallet) {
    return null;
  }

  try {
    // Sign the message hash
    const signature = await wallet.signMessage(ethers.getBytes(messageHash));
    return signature;
  } catch (error) {
    console.error('Failed to sign message:', (error as Error).message);
    throw new Error('Quote signing failed');
  }
}

/**
 * List all authorized signers (without private keys)
 * Safe to use in API responses
 */
export async function listAuthorizedSigners() {
  return prisma.authorizedSigner.findMany({
    where: { isAllowed: true },
    select: {
      id: true,
      address: true,
      isAllowed: true,
      createdAt: true,
      updatedAt: true,
      // privateKey is deliberately excluded
    },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Remove a signer (disable, don't delete)
 * This prevents accidental loss of authorization records
 */
export async function disableSigner(signerAddress: string) {
  const normalizedAddress = signerAddress.toLowerCase();

  return prisma.authorizedSigner.update({
    where: { address: normalizedAddress },
    data: {
      isAllowed: false,
      updatedAt: new Date(),
    },
    select: {
      address: true,
      isAllowed: true,
      updatedAt: true,
    },
  });
}
