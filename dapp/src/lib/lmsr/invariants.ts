import { MarketState } from "./stateMachine";
import {LMSRState} from "./types";

export function assertValidState(state: LMSRState) {
    if (state.b <= 0n) throw new Error("Invalid Liquidity Parameter: ",{ cause: state.b });
    if (state.qYes < 0n) throw new Error("Invalid Yes Votes: ",{ cause: state.qYes });
    if (state.qNo < 0n) throw new Error("Invalid No Votes: ",{ cause: state.qNo });
    if (state.qYes + state.qNo <= 0n) throw new Error("Invalid Total Votes: ",{ cause: state.qYes + state.qNo });
    if (state.qYes + state.qNo > 10n ** 18n) throw new Error("Invalid Total Votes: ",{ cause: state.qYes + state.qNo });
}

export function assertTradeAllowed(
    state: MarketState,
    amount: bigint
) {
    if(amount <= 0n) {
        throw new Error("Invalid trade amount");
    }

    if(state.b <= 0n) {
        throw new Error("Invalid LMSR liquidity parameter");
    }
}