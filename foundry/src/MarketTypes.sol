// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

//////////////////////////
/// Type Declarations ////
//////////////////////////
/**
 * @dev Market lifecycle:
 * - OPEN: Trading permitted
 * - CLOSED: Trading halted, awaiting oracle resolution
 * - RESOLVED: Oracle has finalized outcome, users can redeem
 * - SETTLED: Redemption window closed, no more redemptions allowed
 */
enum MarketState {
    OPEN,
    CLOSED,
    RESOLVED,
    SETTLED
}

enum Outcome {
    YES,
    NO
}

struct TradeQuote {
    address trader;
    address market;
    Outcome outcome;
    uint256 amount;
    uint256 cost;
    uint256 deadline;
    uint256 nonce;
    bool isSell;
    uint256 minAmountOut; // for buys: minimum outcome tokens expected
    uint256 minReturn; // for sells: minimum ETH expected
}

