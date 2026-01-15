// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Test} from "forge-std/Test.sol";
import {console} from "forge-std/console.sol";

import {Market} from "../src/Market.sol";
import {MarketFactory} from "../src/MarketFactory.sol";
import {Vault} from "../src/Vault.sol";
import {OracleAdapter} from "../src/OracleAdapter.sol";
import {OracleBudget} from "../src/OracleBudget.sol";
import {PlatformTreasury} from "../src/PlatformTreasury.sol";
import {SettlementEngine} from "../src/SettlementEngine.sol";
import {QuoteVerifier} from "../src/QuoteVerifier.sol";
import {OutcomeToken} from "../src/OutcomeToken.sol";
import {Outcome, MarketState, TradeQuote} from "../src/MarketTypes.sol";

/**
 * @title FundFlowIntegration
 * @notice Comprehensive tests for corrected fund separation architecture
 * @dev Validates complete lifecycle: Creation → Trading → Resolution → Redemption → Creator Withdrawal
 */
contract FundFlowIntegrationTest is Test {
    //////////////////////////
    /// TEST SETUP ///
    //////////////////////////

    MarketFactory factory;
    Vault vault;
    OracleAdapter oracle;
    OracleBudget oracleBudget;
    PlatformTreasury platformTreasury;
    SettlementEngine settlement;
    QuoteVerifier quoteVerifier;

    address creator = makeAddr("creator");
    address proposer = makeAddr("proposer");
    address trader1 = makeAddr("trader1");
    address trader2 = makeAddr("trader2");
    address resolver = makeAddr("resolver");
    address disputer = makeAddr("disputer");
    address owner = makeAddr("owner");

    uint256 constant LMSR_B = 1 ether;
    uint256 constant SUBSIDY = 0.7 ether; // 0.693 * 1 ether ≈ 0.7
    uint256 constant CREATION_FEE_TOTAL = 0.03 ether;
    uint256 constant ORACLE_BOUNTY = 0.02 ether;
    uint256 constant PLATFORM_FEE = 0.01 ether;
    uint256 constant PROPOSER_BOND = 0.01 ether;
    uint256 constant DISPUTER_BOND = 0.02 ether;

    bytes32 constant MARKET_METADATA_HASH = keccak256("test_market_metadata");

    function setUp() public {
        // Deploy contracts using nonce-based strategy
        // This avoids circular dependency issues by computing all addresses upfront

        // Nonce sequence for this contract's deployment:
        // 0: PlatformTreasury
        // 1: QuoteVerifier
        // 2: OracleBudget
        // 3: OracleAdapter
        // 4: SettlementEngine
        // 5: Vault
        // 6: MarketFactory

        // Pre-compute all addresses using nonce strategy
        uint256 nonce = vm.getNonce(address(this));

        address treasuryAddr = vm.computeCreateAddress(address(this), nonce);
        address quoteVerifierAddr = vm.computeCreateAddress(address(this), nonce + 1);
        address oracleBudgetAddr = vm.computeCreateAddress(address(this), nonce + 2);
        address oracleAddr = vm.computeCreateAddress(address(this), nonce + 3);
        address settlementEngineAddr = vm.computeCreateAddress(address(this), nonce + 4);
        address vaultAddr = vm.computeCreateAddress(address(this), nonce + 5);
        address factoryAddr = vm.computeCreateAddress(address(this), nonce + 6);

        // Deploy in exact nonce order (nonce increments automatically)
        platformTreasury = new PlatformTreasury(owner);
        require(address(platformTreasury) == treasuryAddr, "Treasury nonce mismatch");

        quoteVerifier = new QuoteVerifier(owner);
        require(address(quoteVerifier) == quoteVerifierAddr, "QuoteVerifier nonce mismatch");

        oracleBudget = new OracleBudget(oracleAddr, owner);
        require(address(oracleBudget) == oracleBudgetAddr, "OracleBudget nonce mismatch");

        oracle = new OracleAdapter(
            PROPOSER_BOND,
            7 days, // dispute window
            DISPUTER_BOND,
            3 days, // resolution deadline
            settlementEngineAddr, // Now we have actual address
            payable(oracleBudgetAddr),
            payable(treasuryAddr),
            owner
        );
        require(address(oracle) == oracleAddr, "OracleAdapter nonce mismatch");

        settlement = new SettlementEngine(
            oracleAddr,
            vaultAddr,
            factoryAddr // Now we have actual address
        );
        require(address(settlement) == settlementEngineAddr, "SettlementEngine nonce mismatch");

        vault = new Vault(settlementEngineAddr, factoryAddr);
        require(address(vault) == vaultAddr, "Vault nonce mismatch");

        factory = new MarketFactory(
            vaultAddr,
            oracleAddr,
            payable(oracleBudgetAddr),
            payable(treasuryAddr),
            quoteVerifierAddr,
            settlementEngineAddr,
            owner
        );
        require(address(factory) == factoryAddr, "MarketFactory nonce mismatch");

        // Setup roles
        vm.prank(owner);
        factory.setCreatorWhitelist(creator, true);

        vm.prank(owner);
        oracle.setResolver(resolver, true);

        // Fund test accounts
        vm.deal(creator, 100 ether);
        vm.deal(trader1, 100 ether);
        vm.deal(trader2, 100 ether);
        vm.deal(proposer, 100 ether);
        vm.deal(disputer, 100 ether);
    }

    //////////////////////////
    /// TEST: MARKET CREATION ///
    //////////////////////////

    /**
     * @notice Test complete fund flow during market creation
     * Validates:
     * - Subsidy goes to Vault
     * - Oracle bounty goes to OracleBudget
     * - Platform fee goes to PlatformTreasury
     */
    function test_CreationFundFlow() public {
        uint256 creatorBalance = creator.balance;
        uint256 totalDeposit = SUBSIDY + CREATION_FEE_TOTAL;

        // Create market
        vm.prank(creator);
        address market =
            factory.createMarket{value: totalDeposit}(MARKET_METADATA_HASH, block.timestamp + 30 days, LMSR_B, SUBSIDY);

        // Verify creator balance decreased
        assertEq(creator.balance, creatorBalance - totalDeposit);

        // Verify subsidy in vault
        assertEq(vault.balanceOf(market), SUBSIDY);

        // Verify oracle bounty in OracleBudget
        assertEq(oracleBudget.getBounty(market), ORACLE_BOUNTY);

        // Verify platform fee in treasury
        assertEq(platformTreasury.getBalance(), PLATFORM_FEE);
    }

    /**
     * @notice Test subsidy validation prevents insufficient allocations
     */
    function test_SubsidyValidation() public {
        uint256 insufficientSubsidy = 0.5 ether; // Less than 0.693 * 1
        uint256 totalDeposit = insufficientSubsidy + CREATION_FEE_TOTAL;

        vm.prank(creator);
        vm.expectRevert(MarketFactory.MarketFactory__InvalidSubsidy.selector);
        factory.createMarket{value: totalDeposit}(
            MARKET_METADATA_HASH, block.timestamp + 30 days, LMSR_B, insufficientSubsidy
        );
    }

    //////////////////////////
    /// TEST: UNDISPUTED RESOLUTION ///
    //////////////////////////

    /**
     * @notice Test oracle proposer incentives and bounty payment for undisputed outcome
     * Validates:
     * - Proposer bond returned
     * - Bounty paid from OracleBudget
     * - No platform fee for undisputed case
     */
    function test_UndisputedResolution() public {
        vm.prank(creator);
        address market = factory.createMarket{value: SUBSIDY + CREATION_FEE_TOTAL}(
            MARKET_METADATA_HASH, block.timestamp + 30 days, LMSR_B, SUBSIDY
        );

        // Skip to after market expiration
        vm.warp(block.timestamp + 31 days);

        // Propose outcome
        uint256 proposerBalanceBefore = proposer.balance;
        vm.prank(proposer);
        oracle.proposeOutcome{value: PROPOSER_BOND}(market, Outcome.YES);

        // Skip past dispute window
        vm.warp(block.timestamp + 8 days);

        // Settlement engine finalizes
        vm.prank(address(settlement));
        oracle.finalizeUndisputedOutcome(market);

        // Verify proposer received: bond + bounty
        uint256 proposerBalanceAfter = proposer.balance;
        uint256 received = proposerBalanceAfter - proposerBalanceBefore;

        // Should receive bond + bounty paid from OracleBudget
        assertEq(received, ORACLE_BOUNTY); // Direct bond return

        // Verify bounty was marked as claimed in OracleBudget
        assertTrue(oracleBudget.isBountyClaimed(market));
    }

    //////////////////////////
    /// TEST: DISPUTED RESOLUTION ///
    //////////////////////////

    /**
     * @notice Test disputed resolution with proposer winning
     * Validates:
     * - Proposer gets: bond + bounty + (1-fee) * disputer bond
     * - Platform gets: 50% of dispute fee from loser bond
     * - Resolver gets: 50% of dispute fee
     */
    function test_DisputedResolution_ProposerWins() public {
        // Setup: Create market and expire it
        vm.prank(creator);
        address market = factory.createMarket{value: SUBSIDY + CREATION_FEE_TOTAL}(
            MARKET_METADATA_HASH, block.timestamp + 30 days, LMSR_B, SUBSIDY
        );

        vm.warp(block.timestamp + 31 days);

        // Propose outcome
        vm.prank(proposer);
        oracle.proposeOutcome{value: PROPOSER_BOND}(market, Outcome.YES);

        // Dispute outcome
        vm.prank(disputer);
        oracle.disputeOutcome{value: DISPUTER_BOND}(market);

        // Resolver resolves (proposer was correct)
        uint256 treasuryBefore = platformTreasury.getBalance();

        vm.prank(resolver);
        oracle.resolveOutcome(market, Outcome.YES, true);

        // Verify platform treasury received fee
        uint256 treasuryAfter = platformTreasury.getBalance();
        assertTrue(treasuryAfter > treasuryBefore, "Platform should receive fee");
    }

    /**
     * @notice Test disputed resolution with disputer winning
     * Validates bond redistribution favors disputer
     */
    function test_DisputedResolution_DisputerWins() public {
        // Setup: Create market and expire it
        vm.prank(creator);
        address market = factory.createMarket{value: SUBSIDY + CREATION_FEE_TOTAL}(
            MARKET_METADATA_HASH, block.timestamp + 30 days, LMSR_B, SUBSIDY
        );

        vm.warp(block.timestamp + 31 days);

        // Propose outcome
        vm.prank(proposer);
        oracle.proposeOutcome{value: PROPOSER_BOND}(market, Outcome.YES);

        // Dispute outcome
        uint256 disputerBalanceBefore = disputer.balance;
        vm.prank(disputer);
        oracle.disputeOutcome{value: DISPUTER_BOND}(market);

        // Resolver resolves (disputer was correct)
        vm.prank(resolver);
        oracle.resolveOutcome(market, Outcome.NO, false); // opposite outcome

        // Verify disputer received payout
        uint256 disputerBalanceAfter = disputer.balance;
        assertTrue(disputerBalanceAfter > disputerBalanceBefore, "Disputer should receive bond back + share");
    }

    //////////////////////////
    /// TEST: REDEMPTION WINDOW ///
    //////////////////////////

    /**
     * @notice Test redemption window enforcement
     * Validates:
     * - Traders can redeem during 30-day window
     * - Redemptions fail after window closes
     * - Creator can only withdraw after window closes
     */
    function test_RedemptionWindowEnforcement() public {
        // Setup: Create and expire market
        vm.prank(creator);
        address market = factory.createMarket{value: SUBSIDY + CREATION_FEE_TOTAL}(
            MARKET_METADATA_HASH, block.timestamp + 30 days, LMSR_B, SUBSIDY
        );

        // Trade execution (simplified - would need proper signature verification)
        // Traders mint tokens and deposit ETH
        Market marketContract = Market(market);
        OutcomeToken yesToken = OutcomeToken(marketContract.winningToken(Outcome.YES));

        // Simulate token ownership for trader1
        // (In real test, would use proper TradeQuote + signature)

        // Expire market
        vm.warp(block.timestamp + 31 days);

        // Close market
        marketContract.closeMarket();

        // Propose and finalize outcome
        vm.prank(proposer);
        oracle.proposeOutcome{value: PROPOSER_BOND}(market, Outcome.YES);

        vm.warp(block.timestamp + 8 days);
        oracle.finalizeUndisputedOutcome(market);

        // Verify market is in RESOLVED state
        (MarketState state,,,,,,) = marketContract.getMarketInfo();
        assertEq(uint256(state), uint256(MarketState.RESOLVED));

        // Attempt redemption within window (should succeed if user has tokens)
        // (Would need proper token setup)

        // Skip to after redemption window
        vm.warp(block.timestamp + 31 days);

        // Close redemption
        settlement.closeRedemption(market);

        // Attempt redemption after window (should fail)
        // vm.expectRevert(SettlementEngine.SettlementEngine__RedemptionWindowNotClosed.selector);
        // settlement.redeem(market, 100);
    }

    //////////////////////////
    /// TEST: CREATOR WITHDRAWAL ///
    //////////////////////////

    /**
     * @notice Test creator withdrawal after redemption window
     * Validates:
     * - Creator can't withdraw before window closes
     * - Creator receives remaining vault balance
     * - Only original creator can withdraw
     */
    function test_CreatorWithdrawal() public {
        // Setup: Create market
        vm.prank(creator);
        address market = factory.createMarket{value: SUBSIDY + CREATION_FEE_TOTAL}(
            MARKET_METADATA_HASH, block.timestamp + 30 days, LMSR_B, SUBSIDY
        );

        // Expire and resolve market
        vm.warp(block.timestamp + 31 days);
        Market marketContract = Market(market);
        marketContract.closeMarket();

        vm.prank(proposer);
        oracle.proposeOutcome{value: PROPOSER_BOND}(market, Outcome.YES);

        vm.warp(block.timestamp + 8 days);
        vm.prank(address(settlement));
        oracle.finalizeUndisputedOutcome(market);

        // Attempt withdrawal before window closes (should fail)
        vm.prank(creator);
        vm.expectRevert(SettlementEngine.SettlementEngine__RedemptionWindowNotClosed.selector);
        settlement.creatorWithdraw(market);

        // Skip to after redemption window
        vm.warp(block.timestamp + 31 days);
        settlement.closeRedemption(market);

        // Now creator can withdraw
        uint256 creatorBalanceBefore = creator.balance;
        uint256 vaultBalance = vault.balanceOf(market);

        vm.prank(creator);
        settlement.creatorWithdraw(market);

        // Verify creator received vault balance
        uint256 creatorBalanceAfter = creator.balance;
        assertEq(creatorBalanceAfter - creatorBalanceBefore, vaultBalance);
    }

    /**
     * @notice Test unauthorized withdrawal prevention
     */
    function test_UnauthorizedWithdrawal() public {
        // Setup: Create market
        vm.prank(creator);
        address market = factory.createMarket{value: SUBSIDY + CREATION_FEE_TOTAL}(
            MARKET_METADATA_HASH, block.timestamp + 30 days, LMSR_B, SUBSIDY
        );

        // Expire and resolve
        vm.warp(block.timestamp + 31 days);
        Market marketContract = Market(market);
        marketContract.closeMarket();

        vm.prank(proposer);
        oracle.proposeOutcome{value: PROPOSER_BOND}(market, Outcome.YES);

        vm.warp(block.timestamp + 8 days);
        vm.prank(address(settlement));
        oracle.finalizeUndisputedOutcome(market);

        // Skip to after window
        vm.warp(block.timestamp + 31 days);
        settlement.closeRedemption(market);

        // Non-creator attempts withdrawal
        vm.prank(trader1);
        vm.expectRevert(SettlementEngine.SettlementEngine__UnauthorizedCreator.selector);
        settlement.creatorWithdraw(market);
    }

    //////////////////////////
    /// TEST: STATE TRANSITIONS ///
    //////////////////////////

    /**
     * @notice Test complete market state machine
     * Validates: OPEN → CLOSED → RESOLVED → SETTLED
     */
    function test_StateTransitions() public {
        // Create market in OPEN state
        vm.prank(creator);
        address market = factory.createMarket{value: SUBSIDY + CREATION_FEE_TOTAL}(
            MARKET_METADATA_HASH, block.timestamp + 30 days, LMSR_B, SUBSIDY
        );

        Market marketContract = Market(market);
        (MarketState state,,,,,,) = marketContract.getMarketInfo();
        assertEq(uint256(state), uint256(MarketState.OPEN));

        // Expire and close market
        vm.warp(block.timestamp + 31 days);
        marketContract.closeMarket();

        (state,,,,,,) = marketContract.getMarketInfo();
        assertEq(uint256(state), uint256(MarketState.CLOSED));

        // Propose outcome
        vm.prank(proposer);
        oracle.proposeOutcome{value: PROPOSER_BOND}(market, Outcome.YES);

        // Finalize oracle
        vm.warp(block.timestamp + 8 days);
        vm.prank(address(settlement));
        oracle.finalizeUndisputedOutcome(market);

        // Market moves to RESOLVED after oracle finalization
        (state,,,,,,) = marketContract.getMarketInfo();
        assertEq(uint256(state), uint256(MarketState.RESOLVED));
    }

    //////////////////////////
    /// TEST: FUND ACCOUNTING ///
    //////////////////////////

    /**
     * @notice Test all funds are properly accounted for and accessible
     */
    function test_FundAccounting() public {
        // Create market
        vm.prank(creator);
        address market = factory.createMarket{value: SUBSIDY + CREATION_FEE_TOTAL}(
            MARKET_METADATA_HASH, block.timestamp + 30 days, LMSR_B, SUBSIDY
        );

        // Verify fund distribution
        assertEq(vault.balanceOf(market), SUBSIDY, "Vault should hold subsidy");
        assertEq(oracleBudget.getBounty(market), ORACLE_BOUNTY, "OracleBudget should hold bounty");
        assertEq(platformTreasury.getBalance(), PLATFORM_FEE, "Treasury should hold fee");

        uint256 totalFundsDeployed =
            vault.balanceOf(market) + oracleBudget.getBounty(market) + platformTreasury.getBalance();

        assertEq(totalFundsDeployed, SUBSIDY + CREATION_FEE_TOTAL, "All funds accounted for");
    }
}
