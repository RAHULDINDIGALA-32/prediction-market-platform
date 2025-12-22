// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

//////////////////////////
/// Type Declarations ////
//////////////////////////
enum MarketState {
    CREATED,
    OPEN,
    CLOSED,
    RESOLEVD,
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
}

