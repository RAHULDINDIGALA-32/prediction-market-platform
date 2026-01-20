import { ethers } from 'ethers';
import { MARKET_FACTORY_ABI, QUOTE_VERIFIER_ABI, ORACLE_ADAPTER_ABI } from './adminABIs';

/**
 * Execute admin transaction on-chain and track in database
 * Handles contract calls and database sync
 */

export interface AdminTransactionParams {
  contractAddress: string;
  contractType: 'MarketFactory' | 'QuoteVerifier' | 'OracleAdapter';
  methodName: string;
  methodParams: (string | boolean)[];
  provider: ethers.BrowserProvider;
  signer: ethers.Signer;
}

/**
 * Execute a transaction and wait for confirmation
 * @returns transaction hash
 */
export async function executeAdminTransaction(
  params: AdminTransactionParams
): Promise<string> {
  const { contractAddress, contractType, methodName, methodParams, signer } = params;

  // Select ABI based on contract type
  let abi: string[];
  switch (contractType) {
    case 'MarketFactory':
      abi = MARKET_FACTORY_ABI;
      break;
    case 'QuoteVerifier':
      abi = QUOTE_VERIFIER_ABI;
      break;
    case 'OracleAdapter':
      abi = ORACLE_ADAPTER_ABI;
      break;
    default:
      throw new Error(`Unknown contract type: ${contractType}`);
  }

  // Create contract instance
  const contract = new ethers.Contract(contractAddress, abi, signer);

  // Call method
  const method = (contract as Record<string, unknown>)[methodName];
  if (!method) {
    throw new Error(`Method ${methodName} not found on contract`);
  }

  // Execute transaction
  const tx = await (method as (...args: (string | boolean)[]) => Promise<ethers.TransactionResponse>)(
  ...methodParams
);

  // Return transaction hash immediately
  return tx.hash;
}

/**
 * Wait for transaction confirmation
 */
export async function waitForTransactionConfirmation(
  txHash: string,
  provider: ethers.BrowserProvider,
  confirmations: number = 1
): Promise<ethers.TransactionReceipt | null> {
  return provider.waitForTransaction(txHash, confirmations);
}

/**
 * Validate contract method parameters
 */
export function validateMethodParams(
  methodName: string,
  params: (string | boolean)[]
): boolean {
  // Basic validation - add more as needed
  if (methodName === 'setCreatorWhitelist' || methodName === 'setResolver') {
    if (params.length !== 2) return false;
    if (!ethers.isAddress(params[0] as string)) return false;
    if (typeof params[1] !== 'boolean') return false;
    return true;
  }

  if (methodName === 'addSigner' || methodName === 'removeSigner') {
    if (params.length !== 1) return false;
    if (!ethers.isAddress(params[0] as string)) return false;
    return true;
  }

  return false;
}
