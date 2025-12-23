import { LMSRState, TradeResult } from "./types";
import { lmsrCost } from "./math";

export function getPrices(state: LMSRState) {
    const yes = Number(state.qYes) / Number(state.qYes + state.qNo);

    return {
        yes,
        no: 1 - yes,
    };
}

export function buyYes(
    state: LMSRState,
    amount: bigint
): TradeResult {
    const oldCost = lmsrCost(state.qYes, state.qNo, state.b);

    const newState: LMSRState = {
        ...state,
        qYes: state.qYes + amount,
    };

    const newCost = lmsrCost(
        newState.qYes,
        newState.qNo,
        newState.b
    )

    return {
        costPaid: newCost - oldCost,
        newState,
    };

}