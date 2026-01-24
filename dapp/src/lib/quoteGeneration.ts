/**
 * @file quoteGeneration.ts
 * @description Off-chain LMSR quote generation service
 * Generates signed trade quotes with EIP-712 signatures for on-chain verification
 * Implements authoritative pricing mechanism to prevent manipulation
 */

import { ethers, keccak256, AbiCoder, TypedDataEncoder, Wallet,
  Signature, solidityPacked } from "ethers";
import { lmsrCost } from "./lmsr/math";

const abi = AbiCoder.defaultAbiCoder();


const CHAIN_ID = (() => {
    const chainIdStr = process.env.NEXT_PUBLIC_CHAIN_ID;
    if (!chainIdStr) {
        console.warn(
            "CHAIN_ID not configured, defaulting to 31337 (Hardhat). " +
            "For Sepolia testnet, set CHAIN_ID=11155111"
        );
        return BigInt("31337");
    }
    const chainId = BigInt(chainIdStr);
    if (chainId === BigInt("11155111")) {
        console.log("Quote generation configured for Sepolia testnet (chainId: 11155111)");
    }
    return chainId;
})();


const QUOTE_DEADLINE_SECONDS = parseInt(process.env.NEXT_PUBLIC_QUOTE_DEADLINE_SECONDS || "300"); // 5 minutes default


const TRADE_QUOTE_TYPEHASH = keccak256(
    new TextEncoder().encode(
        "TradeQuote(address trader,address market,Outcome outcome,uint256 amount,uint256 cost,uint256 deadline,uint256 nonce,bool isSell,uint256 minAmountOut,uint256 minReturn)"
    )
);

// Must match on-chain: QuoteVerifier.sol constructor
function getEIP712Domain(quoteVerifierAddress: string) {
    return {
        name: "PredictionMarket-QuoteVerifier", 
        version: "1",
        chainId: CHAIN_ID,
        verifyingContract: quoteVerifierAddress as `0x${string}`,  
    };
}

/**
 * Legacy EIP-712 type definitions (DO NOT USE FOR SIGNING)
 * Kept for reference and verification only.
 * This definition uses "uint8" which produces a DIFFERENT typehash than the deployed contract.
 * 
 * DO NOT use this for signing or verification, as it will cause on-chain signature mismatches.
 */
// const TRADE_QUOTE_TYPES = {
//     TradeQuote: [
//         { name: "trader", type: "address" },
//         { name: "market", type: "address" },
//         { name: "outcome", type: "uint8" },  //  Causes on-chain typehash mismatch!
//         { name: "amount", type: "uint256" },
//         { name: "cost", type: "uint256" },
//         { name: "deadline", type: "uint256" },
//         { name: "nonce", type: "uint256" },
//         { name: "isSell", type: "bool" },
//         { name: "minAmountOut", type: "uint256" },  
//         { name: "minReturn", type: "uint256" },   
//     ],
// };


export interface TradeQuote {
  trader: `0x${string}`;
  market: `0x${string}`;
  outcome: 1 | 2; // Contract enum: 1 = YES, 2 = NO (matches Solidity Outcome enum)
  amount: bigint;
  cost: bigint;
  deadline: bigint;
  nonce: bigint;
  isSell: boolean;
  minAmountOut: bigint;
  minReturn: bigint;
}

export interface SignedTradeQuote extends TradeQuote {
    signature: `0x${string}`;
}

/**
 * MANUAL EIP-712 DIGEST COMPUTATION
 *
 * 1. Hash the struct with the correct TRADE_QUOTE_TYPEHASH
 * 2. Compute domain separator
 * 3. Create EIP-712 prefix (0x1901) + domainSeparator + structHash
 * 4. Hash final digest
 * 5. Sign with raw digest (not through signTypedData)
 */
export function hashTradeQuoteStruct(quote: TradeQuote): `0x${string}` {
  return keccak256(
    abi.encode(
      [
        "bytes32",
        "address",
        "address",
        "uint8",
        "uint256",
        "uint256",
        "uint256",
        "uint256",
        "bool",
        "uint256",
        "uint256",
      ],
      [
        TRADE_QUOTE_TYPEHASH,
        quote.trader,
        quote.market,
        quote.outcome,
        quote.amount,
        quote.cost,
        quote.deadline,
        quote.nonce,
        quote.isSell,
        quote.minAmountOut,
        quote.minReturn,
      ]
    )
  ) as `0x${string}`;
}

/**
 * Compute EIP-712 digest manually
 * Matches: keccak256(abi.encodePacked(uint16(0x1901), domainSeparator, structHash))
 * This is exactly what _hashTypedDataV4 does on-chain
 */
function computeEIP712Digest(
  quote: TradeQuote,
  domain: {
    name: string;
    version: string;
    chainId: bigint;
    verifyingContract: `0x${string}`;
  }
): `0x${string}` {
  const structHash = hashTradeQuoteStruct(quote);
  const domainSeparator = TypedDataEncoder.hashDomain(domain);

//   console.log('Struct Hash for digest computation:', structHash);
//   console.log('Domain Separator for digest computation:', domainSeparator);

// don't use abi.encode here, use solidityPacked to match on-chain packed-encoding
const digest =  keccak256(
    solidityPacked(
      ["bytes2", "bytes32", "bytes32"],
      ["0x1901", domainSeparator, structHash]
    )
  ) as `0x${string}`;
  
  return digest;
}

/**
 * Generates a trade quote for buying or selling outcome tokens
 * Uses LMSR cost function: C(q) = b * ln(e^(qYes/b) + e^(qNo/b))
 * Trade cost = C(q + Δq) - C(q)
 * 
 * 
 * @param marketAddress - Address of the market contract
 * @param quoteVerifierAddress - Address of the QuoteVerifier contract (for EIP-712 domain)
 * @param trader - Address of the trader executing the trade
 * @param outcome - Contract outcome enum value (YES=1 or NO=2)
 * @param amount - Number of tokens to buy/sell (in wei)
 * @param isSell - Whether this is a sell (true) or buy (false)
 * @param currentQYes - Current YES token quantity in market
 * @param currentQNo - Current NO token quantity in market
 * @param lmsrB - LMSR parameter b (liquidity measure)
 * @param lastNonce - Trader's LAST used nonce for this market (from DB)
 * @param minAmountOut - Minimum tokens for buys (slippage protection)
 * @param minReturn - Minimum ETH for sells (slippage protection)
 * @returns Quote with all required fields for on-chain execution (nonce will be lastNonce + 1)
 */
export function generateTradeQuote(
    marketAddress: string,
    quoteVerifierAddress: string,  
    trader: string,
    outcome: 1 | 2,  // Contract enum: 1 = YES, 2 = NO
    amount: bigint,
    isSell: boolean,
    currentQYes: bigint,
    currentQNo: bigint,
    lmsrB: bigint,
    lastNonce: bigint,  
    minAmountOut: bigint,  
    minReturn: bigint    
): TradeQuote {
    if (!ethers.isAddress(marketAddress)) {
        throw new Error("Invalid market address");
    }
    if (!ethers.isAddress(quoteVerifierAddress)) {
        throw new Error("Invalid quote verifier address");
    }
    if (!ethers.isAddress(trader)) {
        throw new Error("Invalid trader address");
    }

    // Validate outcome is contract enum value (1 or 2, not frontend 0 or 1)
    if (outcome !== 1 && outcome !== 2) {
        throw new Error("Invalid outcome: must be 1 (YES) or 2 (NO) per contract enum");
    }

    // Calculate cost using LMSR
    const oldCost = lmsrCost(currentQYes, currentQNo, lmsrB);

    let newQYes = currentQYes;
    let newQNo = currentQNo;

    if (outcome === 1) {
        // YES trade (outcome enum value 1)
        if (isSell) {
            newQYes = newQYes - amount;
        } else {
            newQYes = newQYes + amount;
        }
    } else {
        // NO trade (outcome enum value 2)
        if (isSell) {
            newQNo = newQNo - amount;
        } else {
            newQNo = newQNo + amount;
        }
    }

    const newCost = lmsrCost(newQYes, newQNo, lmsrB);

    // Cost to trader (absolute value)
    let tradeCost: bigint;
    if (isSell) {
        // Seller receives ETH = decrease in cost function
        tradeCost = oldCost - newCost;
    } else {
        // Buyer pays ETH = increase in cost function
        tradeCost = newCost - oldCost;
    }

    const deadline = Math.floor(Date.now() / 1000) + QUOTE_DEADLINE_SECONDS;

    // So we MUST send next nonce, not current
    const nextNonce = lastNonce + BigInt(1);

    return {
        trader: trader.toLowerCase() as `0x${string}`,
        market: marketAddress.toLowerCase() as `0x${string}`,
        outcome,
        amount,
        cost: tradeCost,
        isSell,
        deadline: BigInt(deadline),
        nonce: nextNonce,  
        minAmountOut,  
        minReturn,     
    };
}

/**
 * Signs a trade quote using EIP-712 with manual digest computation
 * 
 * CRITICAL DIFFERENCE FROM PREVIOUS VERSION:
 * - Does NOT use signTypedData() (which would fail due to typehash mismatch)
 * - Instead uses manual EIP-712 digest computation matching the deployed contract
 * - The digest is computed with the EXACT on-chain typehash string: "TradeQuote(address trader,address market,Outcome outcome,...)"
 * - Then signs the digest directly with signMessage()
 * 
 * This ensures the recovered signer matches allowedSigners[] on-chain.
 * 
 * @param quote - The trade quote to sign
 * @param quoteVerifierAddress - Address of QuoteVerifier contract for domain
 * @param signer - Signer instance (should be backend oracle)
 * @returns Signed quote ready for submission on-chain
 * @throws Error if digest computation fails or signing fails
 */
// export async function signTradeQuote(
//     quote: TradeQuote,
//     quoteVerifierAddress: string,  
//     signer: ethers.Signer
// ): Promise<SignedTradeQuote> {
//     try {
//         const domain = getEIP712Domain(quoteVerifierAddress);

//         // Step 1: Compute struct hash using exact on-chain typehash
//         const structHash = hashTradeQuoteStruct(quote);

//         // Step 2: Compute final EIP-712 digest
//         const digest = computeEIP712Digest(domain, structHash);

//         // Step 3: Sign the digest directly (bypass signTypedData to avoid typehash mismatch)
//         // signMessage() signs the raw digest, which is what we want
//         const signature = await signer.signMessage(ethers.getBytes(digest));

//         console.log("[signTradeQuote] Successfully signed quote with outcome", quote.outcome);
//         console.log("[signTradeQuote] Recovered signer will be:", await signer.getAddress());

//         return {
//             ...quote,
//             signature: signature as `0x${string}`,
//         };
//     } catch (error) {
//         console.error("[signTradeQuote] Signing failed:", error);
//         throw error;
//     }
// }



export function signTradeQuote(
  quote: TradeQuote,
  quoteVerifierAddress: `0x${string}`,
  signer: Wallet
): SignedTradeQuote {
  const domain = getEIP712Domain(quoteVerifierAddress);  
  const digest = computeEIP712Digest(quote, domain);
 //console.log('Digest to be signed:', digest);

  const sig = signer.signingKey.sign(digest);
  const signature = Signature.from(sig).serialized as `0x${string}`;

  const recoveredAddress = recoverSigner(quote, signature, domain);
  console.log("[signTradeQuote] Quote signed. Recovered address:", recoveredAddress);

  return { ...quote, signature };
}

export function recoverSigner(
  quote: TradeQuote,
  signature: `0x${string}`,
  domain: {
    name: string;
    version: string;
    chainId: bigint;
    verifyingContract: `0x${string}`;
  }
): `0x${string}` {
  const digest = computeEIP712Digest(quote, domain);
  return ethers.recoverAddress(digest, signature) as `0x${string}`;
}

/**
 * Verifies a trade quote signature
 * Used server-side to ensure quote authenticity
 * 
 * Also uses manual digest computation to match the deployed contract.
 * 
 * @param quote - The trade quote
 * @param quoteVerifierAddress - Address of QuoteVerifier contract
 * @param signature - The signature to verify
 * @param expectedSigner - Expected signer address
 * @returns True if signature is valid and matches expected signer
 */
export function verifyTradeQuoteSignature(
    quote: TradeQuote,
    quoteVerifierAddress: string,  
    signature: string,
    expectedSigner: string
): boolean {
    try {
        const domain = getEIP712Domain(quoteVerifierAddress);

        // Step 1: Recompute struct hash
        //const structHash = hashTradeQuoteStruct(quote);

        // Step 2: Recompute digest
        const digest = computeEIP712Digest(quote, domain);

        // Step 3: Recover signer from signature
        // Note: signMessage uses personal_sign which adds a prefix
        // But since we're verifying against the same digest, it's consistent
        const recoveredAddress = ethers.recoverAddress(digest, signature);

        const matches = recoveredAddress.toLowerCase() === expectedSigner.toLowerCase();
        console.log("[verifyTradeQuoteSignature] Recovered:", recoveredAddress, "Expected:", expectedSigner, "Match:", matches);

        return matches;
    } catch (error) {
        console.error("[verifyTradeQuoteSignature] Verification failed:", error);
        return false;
    }
}

/**
 * Checks if a quote is still valid
 * @param quote - The trade quote
 * @returns True if quote hasn't expired
 */
export function isQuoteValid(quote: TradeQuote): boolean {
    const now = Math.floor(Date.now() / 1000);
    return quote.deadline > now;
}
