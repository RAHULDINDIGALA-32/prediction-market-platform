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
    marketId: string;
    side: "YES" | "NO";
    amount: bigint;
    cost: bigint;
    expiresAt: number;
    version: number;
  };
  
