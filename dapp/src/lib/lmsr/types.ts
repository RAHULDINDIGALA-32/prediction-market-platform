export type LMSRState = {
    qYes: bigint;
    qNo: bigint;
    b: bigint;
};

export type Price = {
    yes: number;
    no: number;
};

export type TradeResult = {
    costPaid: bigint;
    newState: LMSRState;
};

export enum Outcome {
    YES,
    NO,
}

export type TradeQuote = {
    trader: string; // address
    market: string; // market contract address
    outcome: number; // 0 = YES, 1 = NO
    amount: string; // decimal/uint256 as string
    cost: string; // wei uint256 as string
    deadline: number; // unix timestamp
    nonce: string; // uint256 as string
    marketVersion: number;
};

export type SignedTradeQuote = TradeQuote & {
    isSell?: boolean;
    minAmountOut?: string;
    minReturn?: string;
};
  
