// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

//////////////////////////
/// Type Declarations ////
//////////////////////////
enum MarketState {
    OPEN,
    CLOSED,
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

