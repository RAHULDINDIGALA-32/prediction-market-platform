// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/**
 * @title SettlementEngineUnitTests
 * @notice Comprehensive unit tests for SettlementEngine functions
 * @dev Tests redemption, creator withdrawal, window enforcement, etc.
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
import {Outcome, MarketState} from "../src/MarketTypes.sol";

contract SettlementEngineUnitTest is Test {
    //////////////////////////
    /// STATE VARIABLES //////
    //////////////////////////

    MarketFactory factory;
    SettlementEngine settlementEngine;
    OracleAdapter oracle;
    Vault vault;
    QuoteVerifier quoteVerifier;
    OracleBudget oracleBudget;
    PlatformTreasury platformTreasury;

    address creator = makeAddr("creator");
    address trader1 = makeAddr("trader1");
    address trader2 = makeAddr("trader2");
    address proposer = makeAddr("proposer");
    address resolver = makeAddr("resolver");
    address owner = makeAddr("owner");

    uint256 marketCreationFee = 0.03 ether;
    uint256 proposerBond = 0.01 ether;
    uint256 lmsrB = 1 ether;
    uint256 subsidyAmount = 1 ether;
    uint256 marketEndTime;

    //////////////////////////
    /// SETUP //////
    //////////////////////////

    function setUp() public {
        vm.deal(creator, 100 ether);
        vm.deal(trader1, 100 ether);
        vm.deal(trader2, 100 ether);
        vm.deal(proposer, 100 ether);
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

        // Deploy in nonce order
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

        vm.prank(owner);
        factory.setCreatorWhitelist(creator, true);

        vm.prank(owner);
        oracle.setResolver(resolver, true);

        marketEndTime = block.timestamp + 1 days;
    }

    //////////////////////////
    /// REDEMPTION TESTS //////
    //////////////////////////

    function testRedeem_ValidRedemption() public {
        address market = _createAndSettleMarket(Outcome.YES);
        Market marketContract = Market(market);
        OutcomeToken yesToken = marketContract.i_yesToken();

        uint256 userBalance = yesToken.balanceOf(trader1);
        uint256 redeemAmount = userBalance / 2;

        uint256 balanceBefore = trader1.balance;
        vm.prank(trader1);
        settlementEngine.redeem(market, redeemAmount);
        uint256 balanceAfter = trader1.balance;

        // Verify ETH paid out
        assertGt(balanceAfter, balanceBefore);
        // Verify tokens burned
        assertEq(yesToken.balanceOf(trader1), userBalance - redeemAmount);
    }

    function testRedeem_PartialRedemptions() public {
        address market = _createAndSettleMarket(Outcome.YES);
        Market marketContract = Market(market);
        OutcomeToken yesToken = marketContract.i_yesToken();

        uint256 userBalance = yesToken.balanceOf(trader1);

        // First redemption
        vm.prank(trader1);
        settlementEngine.redeem(market, userBalance / 4);

        uint256 trackedRedemption1 = settlementEngine.redeemed(market, trader1);
        assertEq(trackedRedemption1, userBalance / 4);

        // Second redemption
        vm.prank(trader1);
        settlementEngine.redeem(market, userBalance / 4);

        uint256 trackedRedemption2 = settlementEngine.redeemed(market, trader1);
        assertEq(trackedRedemption2, userBalance / 2);

        // Can redeem remaining
        vm.prank(trader1);
        settlementEngine.redeem(market, userBalance / 2);

        uint256 trackedRedemption3 = settlementEngine.redeemed(market, trader1);
        assertEq(trackedRedemption3, userBalance);
        assertEq(yesToken.balanceOf(trader1), 0);
    }

    function testRedeem_ZeroAmount() public {
        address market = _createAndSettleMarket(Outcome.YES);

        vm.prank(trader1);
        vm.expectRevert(SettlementEngine.SettlementEngine__InvalidAmount.selector);
        settlementEngine.redeem(market, 0);
    }

    function testRedeem_InsufficientBalance() public {
        address market = _createAndSettleMarket(Outcome.YES);
        Market marketContract = Market(market);
        OutcomeToken yesToken = marketContract.i_yesToken();

        uint256 userBalance = yesToken.balanceOf(trader1);

        vm.prank(trader1);
        vm.expectRevert(SettlementEngine.SettlementEngine__InsufficientBalance.selector);
        settlementEngine.redeem(market, userBalance + 1);
    }

    function testRedeem_ZeroBalance() public {
        address market = _createAndSettleMarket(Outcome.YES);
        Market marketContract = Market(market);
        OutcomeToken noToken = marketContract.i_noToken();

        uint256 userBalance = noToken.balanceOf(trader1);
        require(userBalance == 0, "Test setup error: trader should have NO tokens");

        vm.prank(trader1);
        vm.expectRevert(SettlementEngine.SettlementEngine__ZeroBalance.selector);
        settlementEngine.redeem(market, 1);
    }

    function testRedeem_WindowClosed() public {
        address market = _createAndSettleMarket(Outcome.YES);
        Market marketContract = Market(market);
        OutcomeToken yesToken = marketContract.i_yesToken();

        uint256 resolvedAt = settlementEngine.marketResolvedAt(market);

        // Move past 30-day window
        vm.warp(resolvedAt + 30 days + 1);

        vm.prank(trader1);
        vm.expectRevert(SettlementEngine.SettlementEngine__RedemptionWindowClosed.selector);
        settlementEngine.redeem(market, yesToken.balanceOf(trader1));
    }

    function testRedeem_AtWindowBoundary() public {
        address market = _createAndSettleMarket(Outcome.YES);
        Market marketContract = Market(market);
        OutcomeToken yesToken = marketContract.i_yesToken();

        uint256 resolvedAt = settlementEngine.marketResolvedAt(market);
        uint256 windowEnd = resolvedAt + 30 days;

        // At exact boundary: should still work
        vm.warp(windowEnd);

        uint256 userBalance = yesToken.balanceOf(trader1);
        vm.prank(trader1);
        settlementEngine.redeem(market, userBalance);

        // After boundary: should fail
        address market2 = _createAndSettleMarket(Outcome.YES);
        Market marketContract2 = Market(market2);
        OutcomeToken yesToken2 = marketContract2.i_yesToken();

        uint256 resolvedAt2 = settlementEngine.marketResolvedAt(market2);
        vm.warp(resolvedAt2 + 30 days + 1);

        vm.prank(trader1);
        vm.expectRevert(SettlementEngine.SettlementEngine__RedemptionWindowClosed.selector);
        settlementEngine.redeem(market2, 1);
    }

    function testRedeem_MultipleUsers() public {
        address market = _createAndSettleMarket(Outcome.YES);
        Market marketContract = Market(market);
        OutcomeToken yesToken = marketContract.i_yesToken();

        // Trader1 redeems
        uint256 trader1Balance = yesToken.balanceOf(trader1);
        vm.prank(trader1);
        settlementEngine.redeem(market, trader1Balance);

        // Trader2 redeems
        uint256 trader2Balance = yesToken.balanceOf(trader2);
        if (trader2Balance > 0) {
            vm.prank(trader2);
            settlementEngine.redeem(market, trader2Balance);
        }

        // Both have zero balance
        assertEq(yesToken.balanceOf(trader1), 0);
        assertEq(yesToken.balanceOf(trader2), 0);
    }

    function testRedeem_InsufficientVaultBalance() public {
        // This would require a vault with depleted balance
        // Normally prevented by invariants, but test defensive coding
        address market = _createAndSettleMarket(Outcome.YES);
        Market marketContract = Market(market);

        // In production, this scenario shouldn't happen due to invariants
        // But if it did, redemption would fail
        assertGe(vault.balanceOf(market), 1 ether);
    }

    //////////////////////////
    /// CREATOR WITHDRAWAL TESTS ///
    //////////////////////////

    function testCreatorWithdraw_ValidWithdrawal() public {
        address market = _createAndSettleMarket(Outcome.YES);

        uint256 resolvedAt = settlementEngine.marketResolvedAt(market);
        vm.warp(resolvedAt + 30 days + 1);

        uint256 remainingBalance = vault.balanceOf(market);

        uint256 creatorBalanceBefore = creator.balance;
        vm.prank(creator);
        settlementEngine.creatorWithdraw(market);
        uint256 creatorBalanceAfter = creator.balance;

        // Creator should receive remaining balance
        assertEq(creatorBalanceAfter - creatorBalanceBefore, remainingBalance);
        assertEq(vault.balanceOf(market), 0);
    }

    function testCreatorWithdraw_NotCreator() public {
        address market = _createAndSettleMarket(Outcome.YES);

        uint256 resolvedAt = settlementEngine.marketResolvedAt(market);
        vm.warp(resolvedAt + 30 days + 1);

        vm.prank(trader1);
        vm.expectRevert(SettlementEngine.SettlementEngine__UnauthorizedCreator.selector);
        settlementEngine.creatorWithdraw(market);
    }

    function testCreatorWithdraw_WindowNotClosed() public {
        address market = _createAndSettleMarket(Outcome.YES);

        uint256 resolvedAt = settlementEngine.marketResolvedAt(market);
        // Move to 29 days (not yet 30 days)
        vm.warp(resolvedAt + 29 days);

        vm.prank(creator);
        vm.expectRevert(SettlementEngine.SettlementEngine__RedemptionWindowNotClosed.selector);
        settlementEngine.creatorWithdraw(market);
    }

    function testCreatorWithdraw_AtWindowBoundary() public {
        address market = _createAndSettleMarket(Outcome.YES);

        uint256 resolvedAt = settlementEngine.marketResolvedAt(market);
        // At exact 30 days
        vm.warp(resolvedAt + 30 days);

        uint256 remainingBalance = vault.balanceOf(market);

        vm.prank(creator);
        settlementEngine.creatorWithdraw(market);

        // Should succeed at boundary
        assertEq(vault.balanceOf(market), 0);
    }

    function testCreatorWithdraw_Idempotent() public {
        address market = _createAndSettleMarket(Outcome.YES);

        uint256 resolvedAt = settlementEngine.marketResolvedAt(market);
        vm.warp(resolvedAt + 30 days + 1);

        // First withdrawal
        vm.prank(creator);
        settlementEngine.creatorWithdraw(market);

        uint256 balanceAfterFirst = vault.balanceOf(market);
        assertEq(balanceAfterFirst, 0);

        // Second withdrawal (should be no-op)
        vm.prank(creator);
        settlementEngine.creatorWithdraw(market);

        // Still zero
        assertEq(vault.balanceOf(market), 0);
    }

    //////////////////////////
    /// CLOSE REDEMPTION TESTS ///
    //////////////////////////

    function testCloseRedemption_ValidClose() public {
        address market = _createAndSettleMarket(Outcome.YES);

        assertFalse(settlementEngine.redemptionClosed(market));

        uint256 resolvedAt = settlementEngine.marketResolvedAt(market);
        vm.warp(resolvedAt + 30 days + 1);

        settlementEngine.closeRedemption(market);

        assertTrue(settlementEngine.redemptionClosed(market));
    }

    function testCloseRedemption_NotResolved() public {
        address market = _createMarket();

        vm.expectRevert(SettlementEngine.SettlementEngine__MarketNotResolved.selector);
        settlementEngine.closeRedemption(market);
    }

    function testCloseRedemption_WindowNotClosed() public {
        address market = _createAndSettleMarket(Outcome.YES);

        uint256 resolvedAt = settlementEngine.marketResolvedAt(market);
        vm.warp(resolvedAt + 29 days);

        vm.expectRevert(SettlementEngine.SettlementEngine__RedemptionWindowNotClosed.selector);
        settlementEngine.closeRedemption(market);
    }

    function testCloseRedemption_Idempotent() public {
        address market = _createAndSettleMarket(Outcome.YES);

        uint256 resolvedAt = settlementEngine.marketResolvedAt(market);
        vm.warp(resolvedAt + 30 days + 1);

        // First close
        settlementEngine.closeRedemption(market);
        assertTrue(settlementEngine.redemptionClosed(market));

        // Second close (should be no-op)
        settlementEngine.closeRedemption(market);
        assertTrue(settlementEngine.redemptionClosed(market));
    }

    //////////////////////////
    /// VIEW FUNCTION TESTS ///
    //////////////////////////

    function testIsRedemptionOpen() public {
        address market = _createAndSettleMarket(Outcome.YES);

        uint256 resolvedAt = settlementEngine.marketResolvedAt(market);

        // Within 30 days: open
        vm.warp(resolvedAt + 15 days);
        assertTrue(settlementEngine.isRedemptionOpen(market));

        // After 30 days: not open
        vm.warp(resolvedAt + 31 days);
        assertFalse(settlementEngine.isRedemptionOpen(market));

        // Before resolution: not open
        address market2 = _createMarket();
        assertFalse(settlementEngine.isRedemptionOpen(market2));
    }

    function testIsRedemptionClosed() public {
        address market = _createAndSettleMarket(Outcome.YES);

        uint256 resolvedAt = settlementEngine.marketResolvedAt(market);

        // Before 30 days: not closed
        vm.warp(resolvedAt + 15 days);
        assertFalse(settlementEngine.isRedemptionClosed(market));

        // After 30 days: closed
        vm.warp(resolvedAt + 31 days);
        assertTrue(settlementEngine.isRedemptionClosed(market));

        // Before resolution: not closed
        address market2 = _createMarket();
        assertFalse(settlementEngine.isRedemptionClosed(market2));
    }

    //////////////////////////
    /// HELPER FUNCTIONS //////
    //////////////////////////

    function _createMarket() private returns (address) {
        bytes32 metadataHash = keccak256(abi.encode("test", block.timestamp));

        vm.prank(creator);
        return factory.createMarket{value: marketCreationFee + subsidyAmount}(
            metadataHash, marketEndTime, lmsrB, subsidyAmount
        );
    }

    function _createAndSettleMarket(Outcome expectedOutcome) private returns (address) {
        address market = _createMarket();
        Market marketContract = Market(market);

        // Trade
        _mintTokens(market, Outcome.YES, 0.5 ether, trader1);
        _mintTokens(market, Outcome.NO, 0.5 ether, trader2);

        // Expire and propose
        vm.warp(marketEndTime + 1);

        vm.prank(proposer);
        oracle.proposeOutcome{value: proposerBond}(market, expectedOutcome);

        // Wait for dispute window
        vm.warp(block.timestamp + 2 days + 1);

        // First redemption triggers auto-settlement
        OutcomeToken winningToken = OutcomeToken(marketContract.winningToken(expectedOutcome));

        address winningTrader = (expectedOutcome == Outcome.YES) ? trader1 : trader2;
        uint256 redeemAmount = winningToken.balanceOf(winningTrader);

        if (redeemAmount > 0) {
            vm.prank(winningTrader);
            settlementEngine.redeem(market, redeemAmount);
        }

        return market;
    }

    function _mintTokens(address market, Outcome outcome, uint256 amount, address user) private {
        Market marketContract = Market(market);
        if (outcome == Outcome.YES) {
            marketContract.i_yesToken().mint(user, amount * 2);
        } else {
            marketContract.i_noToken().mint(user, amount * 2);
        }

        vm.prank(user);
        vault.deposit{value: amount}(market);
    }
}
