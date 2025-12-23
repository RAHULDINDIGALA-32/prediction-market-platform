import { LMSRState } from "./types";
import { lmsrCost} from "./math";

export type MarketState = {
    qYes: bigint;
    qNo: bigint;
    b: bigint;
    collateral: bigint;
    version: number;
};

export type TradeSide ="YES" | "NO";

export function applyTrade(
    state: MarketState,
    side: TradeSide,
    amount: bigint
): { newState: MarketState; cost: bigint } {
    const oldCost = lmsrCost(state.qYes, state.qNo, state.b);

    let newQYes = state.qYes;
    let newQNo = state.qNo;

    if (side === "YES") {
        newQYes += amount;
    } else {
        newQNo += amount;
    }

    const newCost = lmsrCost(newQYes, newQNo, state.b);
    const costPaid = newCost - oldCost;

    return {
        cost: costPaid,
        newState: {
            ...state,
            qYes: newQYes,
            qNo: newQNo,
            collateral: state.collateral + costPaid,
            version: state.version + 1,
        },
    };
}