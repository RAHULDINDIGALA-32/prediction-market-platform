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
    amount: bigint,
    isSell = false
): { newState: MarketState; cost: bigint } {
    const oldCost = lmsrCost(state.qYes, state.qNo, state.b);

    let newQYes = state.qYes;
    let newQNo = state.qNo;

    if (!isSell) {
        // Buy: increase outcome quantity
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
    } else {
        // Sell: decrease outcome quantity and refund the difference
        if (side === "YES") {
            if (amount > state.qYes) throw new Error("Insufficient YES liquidity to sell");
            newQYes -= amount;
        } else {
            if (amount > state.qNo) throw new Error("Insufficient NO liquidity to sell");
            newQNo -= amount;
        }

        const newCost = lmsrCost(newQYes, newQNo, state.b);
        const refund = oldCost - newCost;

        if (refund < 0n) throw new Error("Invalid refund calculation");

        return {
            cost: refund,
            newState: {
                ...state,
                qYes: newQYes,
                qNo: newQNo,
                collateral: state.collateral - refund,
                version: state.version + 1,
            },
        };
    }
}