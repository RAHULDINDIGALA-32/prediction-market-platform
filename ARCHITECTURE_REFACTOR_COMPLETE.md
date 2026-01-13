# Prediction Market Platform - Architecture Refactor Complete

## Overview
Successfully implemented corrected fund separation architecture for industry-grade protocol. Transitioned from flawed design (factory holding ETH, undefined oracle funding) to clean contract separation with proper lifecycle management.

## Architecture Corrections

### 1. Fund Separation (3-Contract Model)

**Before (Problematic):**
- Factory accumulated and held fees indefinitely
- Oracle had no guaranteed bounty fund
- Platform revenue sent to EOA

**After (Corrected):**

#### Vault (Collateral Management)
- Purpose: Custody ETH collateral for market positions
- Holds subsidy deposits (0.7 ETH per market)
- Holds trader deposits during trading phase
- Handles redemption payouts
- **Key Property:** Stateless regarding market logic

#### OracleBudget (Oracle Incentives)
- Purpose: Escrow per-market bounty allocations
- FundMarketBounty: Accepts 0.02 ETH at market creation
- PayUndisputedBounty: Releases bounty when outcome finalized without dispute
- Only OracleAdapter can withdraw bounties
- Creator refund mechanism if market never resolves
- **Key Property:** Guarantees bounty funds exist before usage

#### PlatformTreasury (Revenue Management)
- Purpose: Custody platform fees
- DepositCreationFee: Accepts 0.01 ETH per market creation
- DepositDisputeFee: Accepts disputed bond settlement fees
- Owner-only withdrawal (multisig-ready)
- Accrued fees tracking by source (for accounting)
- **Key Property:** Clean separation, governance-ready

### 2. Market Lifecycle (4-State Machine)

**New State Model:**

```
OPEN
  ↓ [Market expires]
CLOSED
  ↓ [Oracle finalizes outcome]
RESOLVED
  ↓ [Redemption window closes (30 days)]
SETTLED
```

**State Semantics:**
- **OPEN:** Market active, trading enabled
- **CLOSED:** Market expired, no new trades, awaiting oracle resolution
- **RESOLVED:** Oracle finalized outcome, redemptions open, creator cannot withdraw
- **SETTLED:** Redemption window closed, creator can withdraw remaining collateral

### 3. Fund Flow by Scenario

#### Scenario A: Market Creation
```
Creator deposits: SUBSIDY + CREATION_FEE_TOTAL (0.73 ETH)
  ├─ 0.70 ETH → Vault (market subsidy)
  ├─ 0.02 ETH → OracleBudget (oracle bounty escrow)
  └─ 0.01 ETH → PlatformTreasury (platform fee)
```

#### Scenario B: Undisputed Oracle Resolution (Fast Path)
```
Market expires → CLOSED
Oracle proposer posts 0.01 ETH bond
Wait 7 days (dispute window)
No dispute raised
SettlementEngine calls finalize()
  ├─ Return 0.01 ETH bond to proposer
  ├─ OracleBudget pays 0.02 ETH bounty to proposer
  └─ Platform gets nothing (incentivizes fast, truthful proposals)
```

#### Scenario C: Disputed Resolution (Proposer Correct)
```
Proposer posts 0.01 ETH bond
Disputer posts 0.02 ETH bond within 7 days
Resolver determines proposer was correct
  ├─ Proposer receives: 0.01 (bond) + 0.02 (bounty) + 0.01 (50% of disputer bond - fee)
  ├─ Disputer loses: 0.02 ETH - 0.01 (fee share) = 0.01 ETH remains
  ├─ Resolver gets: 0.005 ETH (50% of dispute fee)
  └─ PlatformTreasury receives: 0.005 ETH (50% of dispute fee)
```

#### Scenario D: Disputed Resolution (Disputer Correct)
```
Dispute initiated and resolved
Disputer wins:
  ├─ Disputer receives: 0.02 (bond) + 0.005 (50% of proposer bond - fee)
  ├─ Proposer loses: 0.01 ETH - 0.005 (fee share) = 0.005 ETH remains
  ├─ Resolver gets: 0.0025 ETH
  └─ PlatformTreasury receives: 0.0025 ETH
```

#### Scenario E: Trader Redemption (During 30-Day Window)
```
Market in RESOLVED state (oracle finalized)
Trader holds winning outcome tokens
Redeems 100 YES tokens:
  ├─ Tokens burned from trader account
  ├─ 100 ETH withdrawn from Vault
  └─ Transferred to trader
(Multiple partial redemptions supported)
```

#### Scenario F: Creator Withdrawal (After 30-Day Window)
```
Market reaches SETTLED state (30 days after resolution)
Creator calls creatorWithdraw():
  ├─ Verify caller is original creator
  ├─ Verify redemption window closed
  ├─ Remaining vault balance calculated
  ├─ ETH transferred from Vault to creator
  └─ Represents creator's profit/loss on subsidy
```

## Contract Changes Summary

### MarketTypes.sol
```solidity
enum MarketState {
  OPEN,      // Trading enabled
  CLOSED,    // Expired, awaiting oracle
  RESOLVED,  // Oracle finalized outcome
  SETTLED    // Redemptions closed
}
```

### MarketFactory.sol
- Constructor: Added `_oracleBudget` and `_platformTreasury` parameters
- CreateMarket: Routes fees atomically:
  - `0.02 ETH → oracleBudget.fundMarketBounty()`
  - `0.01 ETH → platformTreasury.depositCreationFee()`
- Removed: `accumulatedFees`, `withdrawFees()` (now stateless)

### OracleAdapter.sol
- Constructor: Accepts `oracleBudget` and `platformTreasury` addresses
- Finalize(): Calls `oracleBudget.payUndisputedBounty()` to pull bounty
- ResolveOutcome(): Routes dispute fees to `platformTreasury.depositDisputeFee()`
- Property: No ETH held (all funds pre-allocated)

### SettlementEngine.sol
- Constructor: Added `_factory` parameter
- New state tracking:
  - `marketResolvedAt[market]`: Timestamp when oracle finalized
  - `redemptionClosed[market]`: Boolean flag
- New functions:
  - `closeRedemption(market)`: Marks market SETTLED after 30 days
  - `creatorWithdraw(market)`: Creator withdraws after window closes
- Updated redeem(): Enforces 30-day redemption window

### Market.sol
- SettleMarket(): Now transitions `CLOSED → RESOLVED` (not to SETTLED)
- Lifecycle: Factory + OracleAdapter coordinate state changes
- SETTLED transition: Handled by SettlementEngine (not Market itself)

### OracleBudget.sol (NEW)
```solidity
- fundMarketBounty(market, amount): Accepts bounty escrow
- payUndisputedBounty(market, proposer, amount): OracleAdapter pulls bounty
- isBountyClaimed(market): Check bounty status
- getBounty(market): View bounty allocation
```

### PlatformTreasury.sol (NEW)
```solidity
- depositCreationFee(source): Accept market creation fees
- depositDisputeFee(source): Accept dispute resolution fees
- withdraw(recipient, amount): Owner withdrawal (multisig-ready)
- getSourceFees(source): Accrued fees tracking
```

## Testing

### Test Suite: FundFlowIntegration.t.sol
Comprehensive coverage of:

1. **Creation Fund Flow** - Validates subsidy, bounty, fee routing
2. **Subsidy Validation** - Rejects insufficient allocations
3. **Undisputed Resolution** - Proposer incentives, bounty payment
4. **Disputed Resolution** - Both proposer and disputer winning scenarios
5. **Redemption Window** - 30-day enforcement, state transitions
6. **Creator Withdrawal** - Post-window only, authorization checks
7. **State Transitions** - OPEN → CLOSED → RESOLVED → SETTLED
8. **Fund Accounting** - Total funds distribution verification

## Security Properties

### Fund Safety
- ✅ No ETH held indefinitely in factory
- ✅ All bounties pre-allocated in dedicated contract
- ✅ Platform fees in separate treasury
- ✅ Pull-based withdrawals (no unsolicited transfers)

### Oracle Incentives
- ✅ Fixed bounty (0.02 ETH) for fast, undisputed proposals
- ✅ Bond-based security for disputed outcomes
- ✅ Resolved bond redistribution prevents collusion
- ✅ 50% platform fee on disputed bonds incentivizes validation

### Creator Protection
- ✅ Subsidy validation prevents insolvent markets
- ✅ 30-day redemption window prevents rug-pulls
- ✅ Creator withdrawal gated by time lock
- ✅ Only original creator can withdraw (authorization check)

### Trader Protection
- ✅ Oracle resolution before redemptions
- ✅ Redemption window ensures liquidity
- ✅ Payout from dedicated vault (collateral safety)

## Transition Notes

### For Deployment
1. Deploy contracts in order: Vault → OracleBudget → PlatformTreasury → QuoteVerifier → OracleAdapter → SettlementEngine → MarketFactory
2. Link addresses in constructors
3. Whitelist initial creators via `setCreatorWhitelist()`
4. Configure oracle resolvers via `setResolver()`

### For Existing Markets
- New architecture applies only to newly created markets
- Existing markets continue under previous rules
- Migration path: deprecate old factory, deploy new factory

### For Frontend Integration
- Track `marketResolvedAt` for redemption deadline calculation
- Disable redeem() UI after `block.timestamp > resolvedAt + 30 days`
- Show creator-only UI for withdrawal after 30-day window
- Display fund breakdown: subsidy vs. platform fee vs. oracle bounty

## Compliance & Governance

- **Multisig-Ready:** PlatformTreasury owner parameter for future DAO
- **Auditable:** All fees tracked by source in treasury
- **Transparent:** Three-contract model makes fund flow explicit
- **Scalable:** Fund mechanisms independent of market count

## Validation Checklist

- ✅ Factory: Stateless market deployer, no ETH custody
- ✅ Oracle: Guaranteed bounty funding via OracleBudget
- ✅ Platform: Revenue properly treasured, not sent to EOA
- ✅ Creator: Gated withdrawal after redemption window
- ✅ Traders: Redemptions window enforced
- ✅ States: 4-state machine (OPEN/CLOSED/RESOLVED/SETTLED)
- ✅ Fund Flow: Atomic routing at creation, pull-based withdrawals
- ✅ Tests: Comprehensive integration test suite
- ✅ Docs: Complete lifecycle documented

## Architecture Comparison

| Aspect | Before | After |
|--------|--------|-------|
| Factory Fund Holding | ❌ Indefinite ETH custody | ✅ Stateless deployer |
| Oracle Funding | ❌ Undefined | ✅ Pre-allocated OracleBudget |
| Platform Fees | ❌ Sent to EOA | ✅ Proper treasury |
| Creator Withdrawal | ❌ No mechanism | ✅ Gated by 30-day window |
| Settlement Lifecycle | ❌ 3 states | ✅ 4 states (RESOLVED separate) |
| Fund Separation | ❌ Mixed in factory | ✅ Clean 3-contract model |
| Reentrancy Protection | ✅ Present | ✅ Enhanced |
| Governance Ready | ❌ No | ✅ Multisig-ready treasury |

## References

**Industry Standards Referenced:**
- Polymarket market architecture (predictoor separation)
- Aave treasury structure (multisig governance)
- Uniswap v3 fee collection (atomic routing)
- OpenZeppelin security patterns

**Protocol Costs:**
- Market Creation: 0.73 ETH (0.70 subsidy + 0.03 fees)
- Oracle Proposal: 0.01 ETH bond (returned + 0.02 bounty if undisputed)
- Dispute: 0.02 ETH bond (returned + share of loser's bond if correct)

---

**Completion Date:** January 13, 2026
**Author:** Rahul Dindigala
**Status:** Ready for Integration Testing & Deployment
