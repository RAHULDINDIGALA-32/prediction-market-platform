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
    trader: `0x${string}`;
    market: `0x${string}`;
    outcome: Outcome;
    amount: bigint;
    cost: number;
    deadline: number;
    nonce: number;
};
