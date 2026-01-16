/**
 * Contract ABIs and utilities for admin management
 * Extracted from deployed contracts
 */

export const MARKET_FACTORY_ABI = [
  'function setCreatorWhitelist(address creator, bool allowed) external',
  'function whitelistedCreators(address creator) external view returns (bool)',
];

export const QUOTE_VERIFIER_ABI = [
  'function addSigner(address signer) external',
  'function removeSigner(address signer) external',
  'function isSigner(address signer) external view returns (bool)',
];

export const ORACLE_ADAPTER_ABI = [
  'function setResolver(address resolver, bool allowed) external',
  'function resolvers(address resolver) external view returns (bool)',
];

/**
 * Action types for admin operations
 */
export enum AdminActionType {
  AddCreator = 'ADD_CREATOR',
  RemoveCreator = 'REMOVE_CREATOR',
  AddSigner = 'ADD_SIGNER',
  RemoveSigner = 'REMOVE_SIGNER',
  AddResolver = 'ADD_RESOLVER',
  RemoveResolver = 'REMOVE_RESOLVER',
}

/**
 * Contract action mapping
 */
export const ACTION_CONFIGS = {
  [AdminActionType.AddCreator]: {
    contractType: 'MarketFactory',
    methodName: 'setCreatorWhitelist',
    params: ['address', 'bool'],
    description: 'Add creator to whitelist',
  },
  [AdminActionType.RemoveCreator]: {
    contractType: 'MarketFactory',
    methodName: 'setCreatorWhitelist',
    params: ['address', 'bool'],
    description: 'Remove creator from whitelist',
  },
  [AdminActionType.AddSigner]: {
    contractType: 'QuoteVerifier',
    methodName: 'addSigner',
    params: ['address'],
    description: 'Add authorized signer',
  },
  [AdminActionType.RemoveSigner]: {
    contractType: 'QuoteVerifier',
    methodName: 'removeSigner',
    params: ['address'],
    description: 'Remove authorized signer',
  },
  [AdminActionType.AddResolver]: {
    contractType: 'OracleAdapter',
    methodName: 'setResolver',
    params: ['address', 'bool'],
    description: 'Add oracle resolver',
  },
  [AdminActionType.RemoveResolver]: {
    contractType: 'OracleAdapter',
    methodName: 'setResolver',
    params: ['address', 'bool'],
    description: 'Remove oracle resolver',
  },
};
