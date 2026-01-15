// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/**
 * @title MarketFlowTest
 * @notice Comprehensive end-to-end tests for the complete prediction market lifecycle
 * @dev Tests: Creation -> Trading -> Oracle Proposal -> Finalization -> Settlement
 */

import {Test} from "forge-std/Test.sol";
import {Market} from "../src/Market.sol";
import {MarketFactory} from "../src/MarketFactory.sol";
import {SettlementEngine} from "../src/SettlementEngine.sol";
import {OracleAdapter} from "../src/OracleAdapter.sol";
import {Vault} from "../src/Vault.sol";
import {QuoteVerifier} from "../src/QuoteVerifier.sol";
import {OutcomeToken} from "../src/OutcomeToken.sol";
import {OracleBudget} from "../src/OracleBudget.sol";
import {PlatformTreasury} from "../src/PlatformTreasury.sol";
import {Outcome, MarketState, TradeQuote} from "../src/MarketTypes.sol";

contract MarketFlowTest is Test {
    //////////////////////////
    /// STATE VARIABLES //////
    //////////////////////////

    // Contracts
    MarketFactory factory;
    SettlementEngine settlementEngine;
    OracleAdapter oracle;
    Vault vault;
    QuoteVerifier quoteVerifier;
    OracleBudget oracleBudget;
    PlatformTreasury platformTreasury;

    // Test participants
    address creator = makeAddr("creator");
    address trader1 = makeAddr("trader1");
    address trader2 = makeAddr("trader2");
    address proposer = makeAddr("proposer");
    address disputer = makeAddr("disputer");
    address resolver = makeAddr("resolver");
    address owner = makeAddr("owner");

    // Test parameters
    uint256 marketCreationFee = 0.03 ether;
    uint256 proposerBond = 0.01 ether;
    uint256 disputerBond = 0.01 ether;
    uint256 lmsrB = 1 ether;
    uint256 subsidyAmount = 1 ether; // 0.693 * lmsrB minimum requirement met

    // Timestamps
    uint256 marketEndTime;
    uint256 disputeWindowDuration = 2 days;

    //////////////////////////
    /// SETUP //////
    //////////////////////////

    function setUp() public {
        // Setup test accounts with ETH
        vm.deal(creator, 100 ether);
        vm.deal(trader1, 100 ether);
        vm.deal(trader2, 100 ether);
        vm.deal(proposer, 100 ether);
        vm.deal(disputer, 100 ether);
        vm.deal(resolver, 100 ether);
        vm.deal(owner, 100 ether);

        // Pre-compute all addresses using nonce strategy
        uint256 nonce = vm.getNonce(address(this));
        address treasuryAddr = vm.computeCreateAddress(address(this), nonce);
        address verifierAddr = vm.computeCreateAddress(address(this), nonce + 1);
        address budgetAddr = vm.computeCreateAddress(address(this), nonce + 2);
        address oracleAddr = vm.computeCreateAddress(address(this), nonce + 3);
        address settlementAddr = vm.computeCreateAddress(address(this), nonce + 4);
        address vaultAddr = vm.computeCreateAddress(address(this), nonce + 5);
        address factoryAddr = vm.computeCreateAddress(address(this), nonce + 6);

        // Deploy contracts in nonce order
        platformTreasury = new PlatformTreasury(owner);
        quoteVerifier = new QuoteVerifier(owner);
        oracleBudget = new OracleBudget(oracleAddr, owner);

        oracle = new OracleAdapter(
            0.01 ether, // proposerBond
            2 days, // disputeWindow
            0.01 ether, // disputerBond
            7 days, // resolutionDeadline
            settlementAddr,
            payable(budgetAddr),
            payable(treasuryAddr),
            owner
        );

        settlementEngine = new SettlementEngine(oracleAddr, vaultAddr, factoryAddr);

        vault = new Vault(settlementAddr, factoryAddr);

        factory = new MarketFactory(
            vaultAddr, oracleAddr, payable(budgetAddr), payable(treasuryAddr), verifierAddr, settlementAddr, owner
        );

        // Register resolver
        vm.prank(owner);
        oracle.setResolver(resolver, true);

        // Whitelist creator
        vm.prank(owner);
        factory.setCreatorWhitelist(creator, true);

        // Market end time = 1 day from now
        marketEndTime = block.timestamp + 1 days;
    }

    //////////////////////////
    /// TEST: COMPLETE FLOW ///
    //////////////////////////

    function testCompleteMarketLifecycle_UndisputedFlow() public {
        // Step 1: Market Creation
        address market = _createMarket();
        Market marketContract = Market(market);

        // Verify market created
        assert(marketContract.state() == MarketState.OPEN);
        assert(marketContract.i_endTime() == marketEndTime);
        assert(marketContract.i_lmsrB() == lmsrB);

        // Step 2: Trading
        (OutcomeToken yesToken, OutcomeToken noToken) = _tradingPhase(market);

        // Verify tokens minted
        assertGt(yesToken.balanceOf(trader1), 0);
        assertGt(noToken.balanceOf(trader2), 0);
        assertGt(vault.balanceOf(market), 0); // Vault has collateral

        // Step 3: Market Expiry
        vm.warp(marketEndTime + 1);

        // Verify market is now closed (checked when trading)
        vm.expectRevert(Market.Market__MarketNotOpen.selector);
        _attemptTrade(market, trader1, Outcome.YES, 0.1 ether);

        // Step 4: Oracle Proposal
        _proposeOutcome(market, Outcome.YES);

        // Verify proposal recorded
        //assertTrue(!oracle.requests[market].finalized);
        assertFalse(oracle.isDisputed(market));

        // Step 5: Wait for dispute window to close
        vm.warp(block.timestamp + disputeWindowDuration + 1);

        // Step 6: LAZY Settlement (auto-finalization on redeem)
        // First user to redeem triggers auto-finalization
        vm.startPrank(trader1);

        // Before redeem, market not yet resolved
        assertEq(oracle.getFinalizationTime(market), 0);

        // Redeem triggers _ensureResolved() → _ensureOracleFinalized() → _tryFinalizeOracle()
        uint256 redeemAmount = yesToken.balanceOf(trader1);
        settlementEngine.redeem(market, redeemAmount);

        // After redeem, market is resolved
        assertGt(oracle.getFinalizationTime(market), 0);
        assert(marketContract.resolvedOutcome() == Outcome.YES);
        vm.stopPrank();

        // Verify winning tokens burned
        assertEq(yesToken.balanceOf(trader1), 0);

        // Step 7: Creator withdrawal (after 30 day window)
        vm.warp(oracle.getFinalizationTime(market) + 30 days + 1);

        uint256 creatorWithdrawAmount = vault.balanceOf(market);
        vm.prank(creator);
        settlementEngine.creatorWithdraw(market);

        // Verify vault emptied
        assertEq(vault.balanceOf(market), 0);

        // Verify market marked as settled
        assertTrue(!settlementEngine.isRedemptionOpen(market));
    }

    function testCompleteMarketLifecycle_DisputedFlow() public {
        // Steps 1-4: Creation, Trading, Expiry, Proposal
        address market = _createMarket();
        _tradingPhase(market);
        vm.warp(marketEndTime + 1);
        _proposeOutcome(market, Outcome.YES);

        // Step 5: Dispute Phase (within dispute window)
        vm.prank(disputer);
        oracle.disputeOutcome{value: disputerBond}(market);

        // Verify disputed
        assertTrue(oracle.isDisputed(market));
        assertFalse(oracle.isFinalized(market));

        // Step 6: Try redemption BEFORE resolution (should fail)
        vm.prank(trader1);
        vm.expectRevert(SettlementEngine.SettlementEngine__OracleOutcomeNotResolved.selector);
        settlementEngine.redeem(market, 1e18);

        // Step 7: Resolver resolves dispute
        // Proposer was correct
        vm.prank(resolver);
        oracle.resolveOutcome(market, Outcome.YES, true);

        // Verify now finalized
        assertTrue(oracle.isFinalized(market));

        // Step 8: NOW redemption works
        Market marketContract = Market(market);
        OutcomeToken yesToken = OutcomeToken(marketContract.winningToken(Outcome.YES));

        vm.prank(trader1);
        uint256 redeemAmount = yesToken.balanceOf(trader1);
        if (redeemAmount > 0) {
            settlementEngine.redeem(market, redeemAmount);
            // Verify settled correctly
            assertGt(oracle.getFinalizationTime(market), 0);
            assert(marketContract.resolvedOutcome() == Outcome.YES);
        }
    }

    function testLazyOracleFinalizeChain() public {
        // Test the complete lazy finalization chain:
        // redeem() → _ensureResolved() → _ensureOracleFinalized() → _tryFinalizeOracle()

        address market = _createMarket();
        _tradingPhase(market);
        vm.warp(marketEndTime + 1);

        // Propose outcome
        _proposeOutcome(market, Outcome.NO);

        // Wait for dispute window to close (undisputed)
        vm.warp(block.timestamp + disputeWindowDuration + 1);

        // BEFORE redemption: oracle not finalized
        assertFalse(oracle.isFinalized(market));
        assertEq(oracle.getFinalizationTime(market), 0);

        // Redemption triggers automatic finalization chain
        Market marketContract = Market(market);
        OutcomeToken noToken = OutcomeToken(marketContract.winningToken(Outcome.NO));
        uint256 userBalance = noToken.balanceOf(trader2);

        vm.prank(trader2);
        settlementEngine.redeem(market, userBalance);

        // AFTER redemption: oracle is finalized AND market is resolved
        assertTrue(oracle.isFinalized(market));
        assertGt(oracle.getFinalizationTime(market), 0);
        assert(marketContract.resolvedOutcome() == Outcome.NO);
    }

    function testIdempotentResolution() public {
        // Test that _ensureResolved() is idempotent (safe to call multiple times)

        address market = _createMarket();
        _tradingPhase(market);
        vm.warp(marketEndTime + 1);
        _proposeOutcome(market, Outcome.YES);
        vm.warp(block.timestamp + disputeWindowDuration + 1);

        Market marketContract = Market(market);
        OutcomeToken yesToken = OutcomeToken(marketContract.winningToken(Outcome.YES));
        uint256 halfBalance = yesToken.balanceOf(trader1) / 2;

        // First redemption triggers resolution
        vm.prank(trader1);
        settlementEngine.redeem(market, halfBalance);
        uint256 resolveTime1 = oracle.getFinalizationTime(market);

        // Wait a bit
        vm.warp(block.timestamp + 100);

        // Second redemption should not change resolution time (idempotent)
        vm.prank(trader1);
        settlementEngine.redeem(market, halfBalance);
        uint256 resolveTime2 = oracle.getFinalizationTime(market);

        assert(resolveTime1 == resolveTime2);
    }

    function testRedemptionWindowEnforcement() public {
        address market = _createMarket();
        Market marketContract = Market(market);
        _tradingPhase(market);
        vm.warp(marketEndTime + 1);
        _proposeOutcome(market, Outcome.YES);
        vm.warp(block.timestamp + disputeWindowDuration + 1);

        OutcomeToken yesToken = OutcomeToken(marketContract.winningToken(Outcome.YES));
        uint256 redeemAmount = yesToken.balanceOf(trader1);

        // Redemption within window works
        vm.prank(trader1);
        settlementEngine.redeem(market, redeemAmount);

        // Move past 30-day window
        vm.warp(oracle.getFinalizationTime(market) + 30 days + 1);

        // Attempt redemption after window should fail
        vm.prank(trader2);
        vm.expectRevert(SettlementEngine.SettlementEngine__RedemptionWindowClosed.selector);
        settlementEngine.redeem(market, 1e18);
    }

    function testDisputeWindowBoundary() public {
        // Test finalization at exact dispute window boundary
        address market = _createMarket();
        _tradingPhase(market);
        vm.warp(marketEndTime + 1);
        _proposeOutcome(market, Outcome.YES);

        uint256 proposalTime = oracle.getProposalTime(market);
        uint256 windowEnd = proposalTime + disputeWindowDuration;

        // At window close - 1 second: should NOT finalize
        vm.warp(windowEnd - 1);
        vm.prank(trader1);
        vm.expectRevert(SettlementEngine.SettlementEngine__OracleOutcomeNotResolved.selector);
        settlementEngine.redeem(market, 1e18);

        // At window close: should finalize
        vm.warp(windowEnd);
        Market marketContract = Market(market);
        OutcomeToken yesToken = OutcomeToken(marketContract.winningToken(Outcome.YES));
        uint256 redeemAmount = yesToken.balanceOf(trader1);

        vm.prank(trader1);
        settlementEngine.redeem(market, redeemAmount);

        // Now finalized
        assertTrue(oracle.isFinalized(market));
    }

    function testMultipleTraders_DifferentOutcomes() public {
        // Test market with multiple traders betting on different outcomes
        address market = _createMarket();
        Market marketContract = Market(market);

        // Trader1 buys YES
        vm.prank(trader1);
        _buyOutcomeTokens(market, Outcome.YES, 1 ether);

        // Trader2 buys NO
        vm.prank(trader2);
        _buyOutcomeTokens(market, Outcome.NO, 1 ether);

        OutcomeToken yesToken = OutcomeToken(marketContract.winningToken(Outcome.YES));
        OutcomeToken noToken = OutcomeToken(marketContract.winningToken(Outcome.NO));

        uint256 trader1Balance = yesToken.balanceOf(trader1);
        uint256 trader2Balance = noToken.balanceOf(trader2);

        assertGt(trader1Balance, 0);
        assertGt(trader2Balance, 0);

        // Market expires and resolves to YES
        vm.warp(marketEndTime + 1);
        _proposeOutcome(market, Outcome.YES);
        vm.warp(block.timestamp + disputeWindowDuration + 1);

        // Trader1 (YES holder) can redeem
        vm.prank(trader1);
        settlementEngine.redeem(market, trader1Balance);
        assertEq(yesToken.balanceOf(trader1), 0);

        // Trader2 (NO holder) cannot redeem (NO was wrong)
        vm.prank(trader2);
        vm.expectRevert(SettlementEngine.SettlementEngine__ZeroBalance.selector);
        settlementEngine.redeem(market, 1);
    }

    function testFundFlow_Creation() public {
        // Test that creation fees and subsidy are distributed correctly
        uint256 oracleBudgetBefore = address(oracleBudget).balance;
        uint256 treasuryBefore = address(platformTreasury).balance;

        address market = _createMarket();

        uint256 oracleBudgetAfter = address(oracleBudget).balance;
        uint256 treasuryAfter = address(platformTreasury).balance;

        // Verify fee distribution
        assertEq(oracleBudgetAfter, oracleBudgetBefore + 0.02 ether); // 0.02 ETH fee
        assertEq(treasuryAfter, treasuryBefore + 0.01 ether); // 0.01 ETH fee

        // Verify subsidy in vault
        assertEq(vault.balanceOf(market), subsidyAmount);
    }

    function testFundFlow_Trading() public {
        address market = _createMarket();
        uint256 vaultBefore = vault.balanceOf(market);

        // Trader buys tokens (deposits ETH to vault)
        vm.prank(trader1);
        _buyOutcomeTokens(market, Outcome.YES, 0.5 ether);

        uint256 vaultAfter = vault.balanceOf(market);
        assertGt(vaultAfter, vaultBefore);
    }

    function testFundFlow_Redemption() public {
        address market = _createMarket();
        Market marketContract = Market(market);

        // Trading
        vm.prank(trader1);
        _buyOutcomeTokens(market, Outcome.YES, 1 ether);

        uint256 vaultBeforeRedemption = vault.balanceOf(market);

        // Expire and settle
        vm.warp(marketEndTime + 1);
        _proposeOutcome(market, Outcome.YES);
        vm.warp(block.timestamp + disputeWindowDuration + 1);

        OutcomeToken yesToken = OutcomeToken(marketContract.winningToken(Outcome.YES));
        uint256 redeemAmount = yesToken.balanceOf(trader1);

        // Redeem
        vm.prank(trader1);
        uint256 trader1BalanceBefore = trader1.balance;
        settlementEngine.redeem(market, redeemAmount);
        uint256 trader1BalanceAfter = trader1.balance;

        uint256 vaultAfterRedemption = vault.balanceOf(market);

        // Verify ETH transferred to trader
        assertGt(trader1BalanceAfter, trader1BalanceBefore);
        // Verify vault balance reduced
        assertLt(vaultAfterRedemption, vaultBeforeRedemption);
    }

    //////////////////////////
    /// HELPER FUNCTIONS //////
    //////////////////////////

    function _createMarket() private returns (address) {
        bytes32 metadataHash = keccak256(abi.encode("test market", block.timestamp));

        vm.prank(creator);
        return factory.createMarket{value: marketCreationFee + subsidyAmount}(
            metadataHash, marketEndTime, lmsrB, subsidyAmount
        );
    }

    function _tradingPhase(address market) private returns (OutcomeToken, OutcomeToken) {
        Market marketContract = Market(market);
        OutcomeToken yesToken = marketContract.i_yesToken();
        OutcomeToken noToken = marketContract.i_noToken();

        // Trader1 buys YES
        vm.prank(trader1);
        _buyOutcomeTokens(market, Outcome.YES, 0.5 ether);

        // Trader2 buys NO
        vm.prank(trader2);
        _buyOutcomeTokens(market, Outcome.NO, 0.5 ether);

        return (yesToken, noToken);
    }

    function _buyOutcomeTokens(address market, Outcome outcome, uint256 ethAmount) private {
        Market marketContract = Market(market);

        // Create quote (simplified - in production would be off-chain signed)
        TradeQuote memory quote = TradeQuote({
            market: market,
            trader: msg.sender,
            outcome: outcome,
            amount: ethAmount * 2, // Simplified: 2x tokens per ETH
            cost: ethAmount,
            nonce: 0,
            deadline: block.timestamp + 1 hours,
            isSell: false,
            minAmountOut: ethAmount,
            minReturn: 0
        });

        // Sign quote (simplified - use actual signature in production)
        bytes memory signature = _signQuote(quote);

        // Execute trade
        marketContract.executeTrade{value: ethAmount}(
            quote,
            signature,
            ethAmount, // minAmountOut
            0 // minReturn
        );
    }

    function _proposeOutcome(address market, Outcome outcome) private {
        vm.prank(proposer);
        oracle.proposeOutcome{value: proposerBond}(market, outcome);
    }

    function _attemptTrade(address market, address trader, Outcome outcome, uint256 ethAmount) private {
        Market marketContract = Market(market);

        TradeQuote memory quote = TradeQuote({
            market: market,
            trader: trader,
            outcome: outcome,
            amount: ethAmount * 2,
            cost: ethAmount,
            nonce: 0,
            deadline: block.timestamp + 1 hours,
            isSell: false,
            minAmountOut: ethAmount,
            minReturn: 0
        });

        bytes memory signature = _signQuote(quote);

        vm.startPrank(trader);
        marketContract.executeTrade{value: ethAmount}(quote, signature, ethAmount, 0);
        vm.stopPrank();
    }

    function _signQuote(TradeQuote memory quote) private pure returns (bytes memory) {
        // Simplified signing - in production use actual EIP-712
        bytes32 hash = keccak256(abi.encode(quote));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(1, hash);
        return abi.encodePacked(r, s, v);
    }
}
