/**
 * @file quoteGeneration.ts
 * @description Off-chain LMSR quote generation service
 * Generates signed trade quotes with EIP-712 signatures for on-chain verification
 * Implements authoritative pricing mechanism to prevent manipulation
 */

import { ethers } from "ethers";
import { Decimal } from "@prisma/client/runtime/library";
import { lmsrCost } from "./lmsr/math";
import { Outcome } from "./lmsr/types";

// Initialize CHAIN_ID with validation and logging
const CHAIN_ID = (() => {
    const chainIdStr = process.env.CHAIN_ID;
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

// Must match on-chain: QuoteVerifier.sol constructor
function getEIP712Domain(quoteVerifierAddress: string) {
    return {
        name: "PredictionMarket-QuoteVerifier", 
        version: "1",
        chainId: CHAIN_ID,
        verifyingContract: quoteVerifierAddress,  
    };
}

/**
 * EIP-712 type definitions for TradeQuote
 * outcome field must be uint8 (matches Outcome enum encoding in Solidity)
 */
const TRADE_QUOTE_TYPES = {
    TradeQuote: [
        { name: "trader", type: "address" },
        { name: "market", type: "address" },
        { name: "outcome", type: "uint8" },  // Contract enum encoded as uint8 (1 or 2)
        { name: "amount", type: "uint256" },
        { name: "cost", type: "uint256" },
        { name: "deadline", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "isSell", type: "bool" },
        { name: "minAmountOut", type: "uint256" },  
        { name: "minReturn", type: "uint256" },   
    ],
};

export interface TradeQuoteData {
    trader: string;
    market: string;
    outcome: 1 | 2; // Contract enum: 1 = YES, 2 = NO (matches Solidity Outcome enum)
    amount: bigint;
    cost: bigint;
    isSell: boolean;
    deadline: number;
    nonce: bigint;
    minAmountOut: bigint;  
    minReturn: bigint;     
}

export interface SignedTradeQuote extends TradeQuoteData {
    signature: string;
}

/**
 * Generates a trade quote for buying or selling outcome tokens
 * Uses LMSR cost function: C(q) = b * ln(e^(qYes/b) + e^(qNo/b))
 * Trade cost = C(q + Δq) - C(q)
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
 * @param traderNonce - Trader's current nonce for this market
 * @param minAmountOut - Minimum tokens for buys (slippage protection)
 * @param minReturn - Minimum ETH for sells (slippage protection)
 * @returns Quote with all required fields for on-chain execution
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
    traderNonce: bigint,
    minAmountOut: bigint,  
    minReturn: bigint    
): TradeQuoteData {
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

    return {
        trader: trader.toLowerCase(),
        market: marketAddress.toLowerCase(),
        outcome,
        amount,
        cost: tradeCost,
        isSell,
        deadline,
        nonce: traderNonce,
        minAmountOut,  
        minReturn,     
    };
}

/**
 * Signs a trade quote using EIP-712
 * Enables on-chain verification and prevents replay attacks
 * 
 * @param quote - The trade quote to sign
 * @param quoteVerifierAddress - Address of QuoteVerifier contract for domain
 * @param signer - Signer instance (should be backend oracle)
 * @returns Signed quote ready for submission
 */
export async function signTradeQuote(
    quote: TradeQuoteData,
    quoteVerifierAddress: string,  
    signer: ethers.Signer
): Promise<SignedTradeQuote> {
    const domain = getEIP712Domain(quoteVerifierAddress);

    const signature = await signer.signTypedData(domain, TRADE_QUOTE_TYPES, {
        trader: quote.trader,
        market: quote.market,
        outcome: quote.outcome,
        amount: quote.amount.toString(),
        cost: quote.cost.toString(),
        deadline: quote.deadline,
        nonce: quote.nonce.toString(),
        isSell: quote.isSell,
        minAmountOut: quote.minAmountOut.toString(),  
        minReturn: quote.minReturn.toString(),        
    });

    return {
        ...quote,
        signature,
    };
}

/**
 * Verifies a trade quote signature
 * Used server-side to ensure quote authenticity
 * 
 * @param quote - The trade quote
 * @param quoteVerifierAddress - Address of QuoteVerifier contract
 * @param signature - The signature to verify
 * @param expectedSigner - Expected signer address
 * @returns True if signature is valid
 */
export function verifyTradeQuoteSignature(
    quote: TradeQuoteData,
    quoteVerifierAddress: string,  
    signature: string,
    expectedSigner: string
): boolean {
    try {
        const domain = getEIP712Domain(quoteVerifierAddress);
        
        const recovered = ethers.verifyTypedData(
            domain,
            TRADE_QUOTE_TYPES,
            {
                trader: quote.trader,
                market: quote.market,
                outcome: quote.outcome,
                amount: quote.amount.toString(),
                cost: quote.cost.toString(),
                deadline: quote.deadline,
                nonce: quote.nonce.toString(),
                isSell: quote.isSell,
                minAmountOut: quote.minAmountOut.toString(),  
                minReturn: quote.minReturn.toString(),        
            },
            signature
        );

        return recovered.toLowerCase() === expectedSigner.toLowerCase();
    } catch (error) {
        console.error("Quote signature verification failed:", error);
        return false;
    }
}

/**
 * Checks if a quote is still valid
 * @param quote - The trade quote
 * @returns True if quote hasn't expired
 */
export function isQuoteValid(quote: TradeQuoteData): boolean {
    const now = Math.floor(Date.now() / 1000);
    return quote.deadline > now;
}
