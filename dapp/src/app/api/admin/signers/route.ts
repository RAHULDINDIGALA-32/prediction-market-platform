import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { encrypt, validateAndNormalizePrivateKey } from '@/lib/encryption';
import { ethers } from 'ethers';

/**
 * POST /api/admin/signers
 * Add or remove an authorized signer
 * For adding signers, requires encrypted private key
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { adminAddress, signerAddress, action, privateKey, txHash } = body;

    // Validate inputs
    if (!ethers.isAddress(adminAddress)) {
      return NextResponse.json(
        { success: false, error: 'Invalid admin address' },
        { status: 400 }
      );
    }

    if (!ethers.isAddress(signerAddress)) {
      return NextResponse.json(
        { success: false, error: 'Invalid signer address' },
        { status: 400 }
      );
    }

    if (!['add', 'remove'].includes(action)) {
      return NextResponse.json(
        { success: false, error: 'Invalid action' },
        { status: 400 }
      );
    }

    if (!txHash || typeof txHash !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Invalid transaction hash' },
        { status: 400 }
      );
    }

    const normalizedSigner = signerAddress.toLowerCase();
    const encryptionKey = process.env.ENCRYPTION_KEY;

    if (!encryptionKey) {
      console.error('Missing ENCRYPTION_KEY environment variable');
      return NextResponse.json(
        { success: false, error: 'Server configuration error' },
        { status: 500 }
      );
    }

    if (action === 'add') {
      // Validate and encrypt private key
      if (!privateKey || typeof privateKey !== 'string') {
        return NextResponse.json(
          { success: false, error: 'Private key required for adding signer' },
          { status: 400 }
        );
      }

      let normalizedKey: string;
      try {
        normalizedKey = validateAndNormalizePrivateKey(privateKey);
      } catch (error) {
        return NextResponse.json(
          {
            success: false,
            error: error instanceof Error ? error.message : 'Invalid private key',
          },
          { status: 400 }
        );
      }

      // Verify private key matches signer address
      try {
        const wallet = new ethers.Wallet(normalizedKey);
        const recoveredAddress = wallet.address.toLowerCase();

        if (recoveredAddress !== normalizedSigner) {
          return NextResponse.json(
            {
              success: false,
              error: `Private key does not match signer address. Expected ${normalizedSigner}, got ${recoveredAddress}`,
            },
            { status: 400 }
          );
        }
      } catch (error) {
        return NextResponse.json(
          {
            success: false,
            error: 'Invalid private key or could not derive address',
          },
          { status: 400 }
        );
      }

      // Encrypt the private key
      let encryptedKey: string;
      try {
        encryptedKey = encrypt(normalizedKey, encryptionKey);
      } catch (error) {
        console.error('Encryption failed:', error);
        return NextResponse.json(
          { success: false, error: 'Failed to encrypt private key' },
          { status: 500 }
        );
      }

      // Store in database
      const signer = await prisma.authorizedSigner.upsert({
        where: { address: normalizedSigner },
        update: {
          privateKey: encryptedKey,
          isAllowed: true,
          updatedAt: new Date(),
        },
        create: {
          address: normalizedSigner,
          privateKey: encryptedKey,
          isAllowed: true,
        },
      });

      return NextResponse.json(
        {
          success: true,
          signer: {
            id: signer.id,
            address: signer.address,
            isAllowed: signer.isAllowed,
            createdAt: signer.createdAt,
          },
          message: 'Signer added successfully',
        },
        { status: 201 }
      );
    } else {
      // Remove signer
      const signer = await prisma.authorizedSigner.upsert({
        where: { address: normalizedSigner },
        update: {
          isAllowed: false,
          updatedAt: new Date(),
        },
        create: {
          address: normalizedSigner,
          privateKey: '', // Empty for removed signers
          isAllowed: false,
        },
      });

      return NextResponse.json(
        {
          success: true,
          signer: {
            id: signer.id,
            address: signer.address,
            isAllowed: signer.isAllowed,
          },
          message: 'Signer removed successfully',
        },
        { status: 200 }
      );
    }
  } catch (error) {
    console.error('Error managing signer:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/admin/signers
 * Fetch all authorized signers (without private keys)
 */
export async function GET(request: NextRequest) {
  try {
    const signers = await prisma.authorizedSigner.findMany({
      where: { isAllowed: true },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        address: true,
        isAllowed: true,
        createdAt: true,
        updatedAt: true,
        // NEVER select privateKey in API responses
      },
    });

    return NextResponse.json(
      {
        success: true,
        signers,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error fetching signers:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
