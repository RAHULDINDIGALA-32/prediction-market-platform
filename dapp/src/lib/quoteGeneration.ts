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

const CHAIN_ID = BigInt(process.env.CHAIN_ID || "31337");
const QUOTE_DEADLINE_SECONDS = parseInt(process.env.QUOTE_DEADLINE_SECONDS || "300"); // 5 minutes default

/**
 * EIP-712 domain separator for TradeQuote signing
 */
function getEIP712Domain(marketAddress: string) {
    return {
        name: "TradeQuote",
        version: "1",
        chainId: CHAIN_ID,
        verifyingContract: marketAddress,
    };
}

/**
 * EIP-712 type definitions for TradeQuote
 */
const TRADE_QUOTE_TYPES = {
    TradeQuote: [
        { name: "trader", type: "address" },
        { name: "market", type: "address" },
        { name: "outcome", type: "uint8" },
        { name: "amount", type: "uint256" },
        { name: "cost", type: "uint256" },
        { name: "isSell", type: "bool" },
        { name: "deadline", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "marketVersion", type: "uint256" },
    ],
};

export interface TradeQuoteData {
    trader: string;
    market: string;
    outcome: 0 | 1; // 0 = YES, 1 = NO
    amount: bigint;
    cost: bigint;
    isSell: boolean;
    deadline: number;
    nonce: bigint;
    marketVersion: number;
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
 * @param trader - Address of the trader executing the trade
 * @param outcome - Outcome to trade (YES=0 or NO=1)
 * @param amount - Number of tokens to buy/sell (in wei)
 * @param isSell - Whether this is a sell (true) or buy (false)
 * @param currentQYes - Current YES token quantity in market
 * @param currentQNo - Current NO token quantity in market
 * @param lmsrB - LMSR parameter b (liquidity measure)
 * @param traderNonce - Trader's current nonce for this market
 * @param marketVersion - Current version of market state
 * @returns Quote with all required fields for on-chain execution
 */
export function generateTradeQuote(
    marketAddress: string,
    trader: string,
    outcome: 0 | 1,
    amount: bigint,
    isSell: boolean,
    currentQYes: bigint,
    currentQNo: bigint,
    lmsrB: bigint,
    traderNonce: bigint,
    marketVersion: number
): TradeQuoteData {
    // Calculate cost using LMSR
    const oldCost = lmsrCost(currentQYes, currentQNo, lmsrB);

    let newQYes = currentQYes;
    let newQNo = currentQNo;

    if (outcome === 0) {
        // YES trade
        if (isSell) {
            newQYes = newQYes - amount;
        } else {
            newQYes = newQYes + amount;
        }
    } else {
        // NO trade
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
        marketVersion,
    };
}

/**
 * Signs a trade quote using EIP-712
 * Enables on-chain verification and prevents replay attacks
 * 
 * @param quote - The trade quote to sign
 * @param signerPrivateKey - Private key of the signer (should be backend oracle)
 * @returns Signed quote ready for submission
 */
export async function signTradeQuote(
    quote: TradeQuoteData,
    signer: ethers.Signer
): Promise<SignedTradeQuote> {
    const domain = getEIP712Domain(quote.market);

    const signature = await signer.signTypedData(domain, TRADE_QUOTE_TYPES, {
        trader: quote.trader,
        market: quote.market,
        outcome: quote.outcome,
        amount: quote.amount.toString(),
        cost: quote.cost.toString(),
        isSell: quote.isSell,
        deadline: quote.deadline,
        nonce: quote.nonce.toString(),
        marketVersion: quote.marketVersion,
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
 * @param signature - The signature to verify
 * @param expectedSigner - Expected signer address
 * @returns True if signature is valid
 */
export function verifyTradeQuoteSignature(
    quote: TradeQuoteData,
    signature: string,
    expectedSigner: string
): boolean {
    try {
        const domain = getEIP712Domain(quote.market);
        
        const recovered = ethers.verifyTypedData(
            domain,
            TRADE_QUOTE_TYPES,
            {
                trader: quote.trader,
                market: quote.market,
                outcome: quote.outcome,
                amount: quote.amount.toString(),
                cost: quote.cost.toString(),
                isSell: quote.isSell,
                deadline: quote.deadline,
                nonce: quote.nonce.toString(),
                marketVersion: quote.marketVersion,
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
