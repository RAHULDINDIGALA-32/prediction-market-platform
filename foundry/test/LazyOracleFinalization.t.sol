// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/**
 * @title LazyOracleFinalizationTest
 * @notice Unit tests for lazy oracle finalization mechanism
 * @dev Tests the automatic finalization pattern and edge cases
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

contract LazyOracleFinalizeTest is Test {
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
    address trader = makeAddr("trader");
    address proposer = makeAddr("proposer");
    address disputer = makeAddr("disputer");
    address resolver = makeAddr("resolver");
    address owner = makeAddr("owner");

    uint256 marketCreationFee = 0.03 ether;
    uint256 proposerBond = 0.01 ether;
    uint256 disputerBond = 0.01 ether;
    uint256 lmsrB = 1 ether;
    uint256 subsidyAmount = 1 ether;
    uint256 disputeWindowDuration = 2 days;

    uint256 marketEndTime;

    //////////////////////////
    /// SETUP //////
    //////////////////////////

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
            0.01 ether, // PROPOSER_BOND
            2 days, // DISPUTE_WINDOW
            0.01 ether, // DISPUTER_BOND
            7 days, // RESOLUTION_DEADLINE
            settlementEngineAddr, // Now we have actual address
            payable(oracleBudgetAddr),
            payable(treasuryAddr),
            owner
        );
        require(address(oracle) == oracleAddr, "OracleAdapter nonce mismatch");

        settlementEngine = new SettlementEngine(
            oracleAddr,
            vaultAddr,
            factoryAddr // Now we have actual address
        );
        require(address(settlementEngine) == settlementEngineAddr, "SettlementEngine nonce mismatch");

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

        vm.prank(owner);
        factory.setCreatorWhitelist(creator, true);

        vm.prank(owner);
        oracle.setResolver(resolver, true);

        // Fund test addresses
        vm.deal(creator, 100 ether);
        vm.deal(trader, 100 ether);
        vm.deal(proposer, 100 ether);
        vm.deal(disputer, 100 ether);
        vm.deal(resolver, 100 ether);
        vm.deal(owner, 100 ether);

        marketEndTime = block.timestamp + 1 days;
    }

    //////////////////////////
    /// LAZY FINALIZATION TESTS ///
    //////////////////////////

    function testLazyFinalization_NotYetFinalizable() public {
        // Create market with future end time
        uint256 localMarketEndTime = block.timestamp + 1 days;
        bytes32 metadataHash = keccak256(abi.encode("test", block.timestamp, uint256(blockhash(block.number - 1))));

        vm.prank(creator);
        address market = factory.createMarket{value: marketCreationFee + subsidyAmount}(
            metadataHash, localMarketEndTime, lmsrB, subsidyAmount
        );
        Market marketContract = Market(market);

        // Trade
        _buyTokens(market, Outcome.YES, 0.5 ether);

        // Market expires
        vm.warp(localMarketEndTime + 1);

        // Propose outcome
        _proposeOutcome(market, Outcome.YES);

        uint256 proposalTime = oracle.getProposalTime(market);
        uint256 windowEnd = proposalTime + oracle.getDisputeWindow();

        // Move to 1 second before window end
        vm.warp(windowEnd - 1);

        // Attempt redemption - should revert because oracle isn't finalized
        OutcomeToken yesToken = marketContract.i_yesToken();
        uint256 balance = yesToken.balanceOf(trader);

        if (balance > 0) {
            vm.expectRevert(SettlementEngine.SettlementEngine__OracleOutcomeNotResolved.selector);
            vm.prank(trader);
            settlementEngine.redeem(market, balance);
        }

        // Oracle should NOT be finalized
        assertFalse(oracle.isFinalized(market));
    }

    function testLazyFinalization_ExactBoundary() public {
        // Create market with future end time
        uint256 localMarketEndTime = block.timestamp + 1 days;
        bytes32 metadataHash = keccak256(abi.encode("boundary", block.timestamp, uint256(blockhash(block.number - 1))));

        vm.prank(creator);
        address market = factory.createMarket{value: marketCreationFee + subsidyAmount}(
            metadataHash, localMarketEndTime, lmsrB, subsidyAmount
        );
        Market marketContract = Market(market);

        // Trade
        _buyTokens(market, Outcome.YES, 0.5 ether);

        // Market expires
        vm.warp(localMarketEndTime + 1);

        // Propose outcome
        _proposeOutcome(market, Outcome.YES);

        uint256 proposalTime = oracle.getProposalTime(market);
        uint256 windowEnd = proposalTime + oracle.getDisputeWindow();

        // Move to exact window end
        vm.warp(windowEnd);

        // Redemption should work (oracle auto-finalizes)
        OutcomeToken yesToken = marketContract.i_yesToken();
        uint256 redeemAmount = yesToken.balanceOf(trader);

        vm.prank(trader);
        settlementEngine.redeem(market, redeemAmount);

        // Oracle should be finalized
        assertTrue(oracle.isFinalized(market));
        assertEq(uint256(marketContract.resolvedOutcome()), uint256(Outcome.YES));
    }

    function testLazyFinalization_AfterWindowClose() public {
        // Create market with future end time
        uint256 localMarketEndTime = block.timestamp + 1 days;
        bytes32 metadataHash =
            keccak256(abi.encode("after_window", block.timestamp, uint256(blockhash(block.number - 1))));

        vm.prank(creator);
        address market = factory.createMarket{value: marketCreationFee + subsidyAmount}(
            metadataHash, localMarketEndTime, lmsrB, subsidyAmount
        );
        Market marketContract = Market(market);

        // Trade
        _buyTokens(market, Outcome.YES, 0.5 ether);

        // Market expires
        vm.warp(localMarketEndTime + 1);

        // Propose outcome
        _proposeOutcome(market, Outcome.YES);

        // Move past dispute window
        vm.warp(block.timestamp + oracle.getDisputeWindow() + 1 days);

        // Redemption should still work
        OutcomeToken yesToken = marketContract.i_yesToken();
        uint256 redeemAmount = yesToken.balanceOf(trader);

        vm.prank(trader);
        settlementEngine.redeem(market, redeemAmount);

        assertTrue(oracle.isFinalized(market));
    }

    function testLazyFinalization_OnFirstRedemption() public {
        // Create market with future end time
        uint256 localMarketEndTime = block.timestamp + 1 days;
        bytes32 metadataHash =
            keccak256(abi.encode("first_redemption", block.timestamp, uint256(blockhash(block.number - 1))));

        vm.prank(creator);
        address market = factory.createMarket{value: marketCreationFee + subsidyAmount}(
            metadataHash, localMarketEndTime, lmsrB, subsidyAmount
        );
        Market marketContract = Market(market);

        // Trade
        _buyTokens(market, Outcome.YES, 0.5 ether);

        // Market expires and settles
        vm.warp(localMarketEndTime + 1);
        _proposeOutcome(market, Outcome.YES);
        vm.warp(block.timestamp + oracle.getDisputeWindow() + 1);

        // Before redemption: not finalized
        assertFalse(oracle.isFinalized(market));
        assertEq(oracle.getFinalizationTime(market), 0);

        // First redemption triggers finalization
        OutcomeToken yesToken = marketContract.i_yesToken();
        uint256 redeemAmount = yesToken.balanceOf(trader);

        vm.prank(trader);
        settlementEngine.redeem(market, redeemAmount);

        // After redemption: finalized and resolved
        assertTrue(oracle.isFinalized(market));
        assertGt(oracle.getFinalizationTime(market), 0);
    }

    function testLazyFinalization_IdempotentFinalization() public {
        // Create and settle market
        uint256 localMarketEndTime = block.timestamp + 1 days;
        bytes32 metadataHash =
            keccak256(abi.encode("idempotent", block.timestamp, uint256(blockhash(block.number - 1))));

        vm.prank(creator);
        address market = factory.createMarket{value: marketCreationFee + subsidyAmount}(
            metadataHash, localMarketEndTime, lmsrB, subsidyAmount
        );
        Market marketContract = Market(market);

        _buyTokens(market, Outcome.NO, 0.5 ether);
        vm.warp(localMarketEndTime + 1);
        _proposeOutcome(market, Outcome.NO);
        vm.warp(block.timestamp + oracle.getDisputeWindow() + 1);

        OutcomeToken noToken = marketContract.i_noToken();
        uint256 balance = noToken.balanceOf(trader);

        // First redemption
        vm.prank(trader);
        settlementEngine.redeem(market, balance / 2);

        uint256 finalizationTime1 = oracle.getFinalizationTime(market);
        assertTrue(oracle.isFinalized(market));

        // Move time forward
        vm.warp(block.timestamp + 100);

        // Attempt second redemption with same user
        vm.prank(trader);
        settlementEngine.redeem(market, balance / 2);

        uint256 finalizationTime2 = oracle.getFinalizationTime(market);

        // Resolution time should be identical (idempotent)
        assertEq(finalizationTime1, finalizationTime2);
    }

    function testLazyFinalization_DisputeBlocksFinalization() public {
        // Create market
        uint256 localMarketEndTime = block.timestamp + 1 days;
        bytes32 metadataHash =
            keccak256(abi.encode("dispute_blocks", block.timestamp, uint256(blockhash(block.number - 1))));

        vm.prank(creator);
        address market = factory.createMarket{value: marketCreationFee + subsidyAmount}(
            metadataHash, localMarketEndTime, lmsrB, subsidyAmount
        );
        Market marketContract = Market(market);

        // Trade
        _buyTokens(market, Outcome.YES, 0.5 ether);

        // Market expires
        vm.warp(localMarketEndTime + 1);

        // Propose outcome
        _proposeOutcome(market, Outcome.YES);

        // Dispute (while window still open)
        vm.prank(disputer);
        oracle.disputeOutcome{value: disputerBond}(market);

        // Move past dispute window
        vm.warp(block.timestamp + oracle.getDisputeWindow() + 1);

        // Oracle is disputed, NOT finalized
        assertTrue(oracle.isDisputed(market));
        assertFalse(oracle.isFinalized(market));

        // Attempt redemption should fail
        OutcomeToken yesToken = marketContract.i_yesToken();
        uint256 balance = yesToken.balanceOf(trader);

        if (balance > 0) {
            vm.expectRevert(SettlementEngine.SettlementEngine__OracleOutcomeNotResolved.selector);
            vm.prank(trader);
            settlementEngine.redeem(market, balance);
        }
    }

    function testLazyFinalization_DisputeResolution_ThenAuto() public {
        // Create and dispute market
        uint256 localMarketEndTime = block.timestamp + 1 days;
        bytes32 metadataHash =
            keccak256(abi.encode("dispute_resolution", block.timestamp, uint256(blockhash(block.number - 1))));

        vm.prank(creator);
        address market = factory.createMarket{value: marketCreationFee + subsidyAmount}(
            metadataHash, localMarketEndTime, lmsrB, subsidyAmount
        );
        Market marketContract = Market(market);

        _buyTokens(market, Outcome.YES, 0.5 ether);
        vm.warp(localMarketEndTime + 1);
        _proposeOutcome(market, Outcome.YES);

        vm.prank(disputer);
        oracle.disputeOutcome{value: disputerBond}(market);

        // Resolver resolves dispute
        vm.prank(resolver);
        oracle.resolveOutcome(market, Outcome.YES, true);

        // Now oracle is finalized
        assertTrue(oracle.isFinalized(market));

        // Redemption should work (no auto-finalization needed)
        OutcomeToken yesToken = marketContract.i_yesToken();
        uint256 redeemAmount = yesToken.balanceOf(trader);

        vm.prank(trader);
        settlementEngine.redeem(market, redeemAmount);

        assertTrue(oracle.isFinalized(market));
        assertGt(oracle.getFinalizationTime(market), 0);
    }

    function testTryFinalizeOracleInternal_AllPaths() public {
        // This test verifies the three condition checks in _tryFinalizeOracle:
        // Path 1: Already finalized (idempotent)
        // Path 2: Disputed (silent return)
        // Path 3: Window not closed (silent return)
        // Path 4: All conditions met (finalize)

        // Start with current time
        uint256 localMarketEndTime = block.timestamp + 1 days;

        bytes32 metadataHash =
            keccak256(abi.encode("lazy finalize test", block.timestamp, uint256(blockhash(block.number - 1))));

        vm.prank(creator);
        address market = factory.createMarket{value: marketCreationFee + subsidyAmount}(
            metadataHash, localMarketEndTime, lmsrB, subsidyAmount
        );
        Market marketContract = Market(market);

        _buyTokens(market, Outcome.YES, 0.5 ether);
        vm.warp(localMarketEndTime + 1);
        _proposeOutcome(market, Outcome.YES);

        // Path 1: Before window close
        uint256 proposalTime = oracle.getProposalTime(market);
        uint256 windowEnd1 = proposalTime + oracle.getDisputeWindow();
        vm.warp(windowEnd1 - 1 days); // Still 1 day before window close

        OutcomeToken yesToken = marketContract.i_yesToken();
        uint256 redeemAmount = yesToken.balanceOf(trader);

        // Should fail - window not closed
        if (redeemAmount > 0) {
            vm.expectRevert(SettlementEngine.SettlementEngine__OracleOutcomeNotResolved.selector);
            vm.prank(trader);
            settlementEngine.redeem(market, redeemAmount);
        }

        // Path 2: Test with dispute - create new market for clean state
        uint256 localMarketEndTime2 = block.timestamp + 1 days;
        bytes32 metadataHash2 = keccak256(abi.encode("path2", block.timestamp, uint256(blockhash(block.number - 1))));

        vm.prank(creator);
        address market2 = factory.createMarket{value: marketCreationFee + subsidyAmount}(
            metadataHash2, localMarketEndTime2, lmsrB, subsidyAmount
        );
        Market marketContract2 = Market(market2);
        _buyTokens(market2, Outcome.YES, 0.5 ether);
        vm.warp(localMarketEndTime2 + 1);
        _proposeOutcome(market2, Outcome.YES);

        vm.prank(disputer);
        oracle.disputeOutcome{value: disputerBond}(market2);

        uint256 proposalTime2 = oracle.getProposalTime(market2);
        vm.warp(proposalTime2 + oracle.getDisputeWindow() + 1); // Window closed but disputed

        // Should fail - disputed outcome
        OutcomeToken yesToken2 = marketContract2.i_yesToken();
        vm.expectRevert(SettlementEngine.SettlementEngine__OracleOutcomeNotResolved.selector);
        vm.prank(trader);
        settlementEngine.redeem(market2, yesToken2.balanceOf(trader));

        // Path 4: Undisputed, window closed
        uint256 localMarketEndTime3 = block.timestamp + 1 days;
        bytes32 metadataHash3 = keccak256(abi.encode("path4", block.timestamp, uint256(blockhash(block.number - 1))));

        vm.prank(creator);
        address market3 = factory.createMarket{value: marketCreationFee + subsidyAmount}(
            metadataHash3, localMarketEndTime3, lmsrB, subsidyAmount
        );
        Market marketContract3 = Market(market3);
        _buyTokens(market3, Outcome.YES, 0.5 ether);
        vm.warp(localMarketEndTime3 + 1);
        _proposeOutcome(market3, Outcome.YES);

        uint256 proposalTime3 = oracle.getProposalTime(market3);
        vm.warp(proposalTime3 + oracle.getDisputeWindow() + 1);

        // Should succeed - auto-finalize and resolve
        OutcomeToken yesToken3 = marketContract3.i_yesToken();
        uint256 redeemAmount3 = yesToken3.balanceOf(trader);

        vm.prank(trader);
        settlementEngine.redeem(market3, redeemAmount3);

        assertTrue(oracle.isFinalized(market3));
        assertEq(uint256(marketContract3.resolvedOutcome()), uint256(Outcome.YES));
    }

    function testEnsureOracleFinalizedCheck() public {
        // Test the guarantee: after _ensureOracleFinalized() returns,
        // oracle.isFinalized(market) == true

        uint256 localMarketEndTime = block.timestamp + 1 days;
        bytes32 metadataHash =
            keccak256(abi.encode("ensure_check", block.timestamp, uint256(blockhash(block.number - 1))));

        vm.prank(creator);
        address market = factory.createMarket{value: marketCreationFee + subsidyAmount}(
            metadataHash, localMarketEndTime, lmsrB, subsidyAmount
        );
        Market marketContract = Market(market);

        _buyTokens(market, Outcome.YES, 0.5 ether);
        vm.warp(localMarketEndTime + 1);
        _proposeOutcome(market, Outcome.YES);

        uint256 proposalTime = oracle.getProposalTime(market);
        vm.warp(proposalTime + oracle.getDisputeWindow() + 1);

        // Undisputed case: should finalize
        OutcomeToken yesToken = marketContract.i_yesToken();
        vm.prank(trader);
        settlementEngine.redeem(market, yesToken.balanceOf(trader));

        assertTrue(oracle.isFinalized(market));
    }

    function testDisputedOutcomePreventsClosure() public {
        // Ensure disputed outcomes prevent lazy closure
        // and require explicit resolver action

        uint256 localMarketEndTime = block.timestamp + 1 days;
        bytes32 metadataHash =
            keccak256(abi.encode("disputed_outcome", block.timestamp, uint256(blockhash(block.number - 1))));

        vm.prank(creator);
        address market = factory.createMarket{value: marketCreationFee + subsidyAmount}(
            metadataHash, localMarketEndTime, lmsrB, subsidyAmount
        );
        Market marketContract = Market(market);

        _buyTokens(market, Outcome.YES, 0.5 ether);
        vm.warp(localMarketEndTime + 1);
        _proposeOutcome(market, Outcome.YES);

        // Dispute within window
        uint256 proposalTime = oracle.getProposalTime(market);
        vm.warp(proposalTime + 1 days); // Still within dispute window
        vm.prank(disputer);
        oracle.disputeOutcome{value: disputerBond}(market);

        // Even after dispute window closes, disputed outcome doesn't auto-finalize
        vm.warp(proposalTime + oracle.getDisputeWindow() + 1);

        OutcomeToken yesToken = marketContract.i_yesToken();
        vm.expectRevert(SettlementEngine.SettlementEngine__OracleOutcomeNotResolved.selector);
        vm.prank(trader);
        settlementEngine.redeem(market, yesToken.balanceOf(trader));

        // Resolver must explicitly resolve
        vm.prank(resolver);
        oracle.resolveOutcome(market, Outcome.YES, true);

        // Now it's finalized
        assertTrue(oracle.isFinalized(market));

        // Now redemption works
        vm.prank(trader);
        settlementEngine.redeem(market, yesToken.balanceOf(trader));
    }

    //////////////////////////
    /// HELPER FUNCTIONS //////
    //////////////////////////

    function _createMarket() private returns (address) {
        bytes32 metadataHash =
            keccak256(abi.encode("lazy finalize test", block.timestamp, uint256(blockhash(block.number - 1))));

        vm.prank(creator);
        return factory.createMarket{value: marketCreationFee + subsidyAmount}(
            metadataHash, marketEndTime, lmsrB, subsidyAmount
        );
    }

    function _buyTokens(address market, Outcome outcome, uint256 ethAmount) private {
        Market marketContract = Market(market);

        // Deposit ETH to vault first
        vm.prank(trader);
        vault.deposit{value: ethAmount}(market);

        // Mint tokens to trader (simplified - normally would be through proper trade mechanism)
        vm.startPrank(market);
        if (outcome == Outcome.YES) {
            marketContract.i_yesToken().mint(trader, ethAmount);
        } else {
            marketContract.i_noToken().mint(trader, ethAmount);
        }
        vm.stopPrank();
    }

    function _proposeOutcome(address market, Outcome outcome) private {
        vm.prank(proposer);
        oracle.proposeOutcome{value: proposerBond}(market, outcome);
    }
}
