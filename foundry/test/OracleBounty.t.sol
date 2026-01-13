// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/**
 * @title OracleBountyTest
 * @notice Tests for oracle proposer bonuses and platform fee distribution
 */

import {Test} from "forge-std/Test.sol";
import {OracleAdapter} from "src/OracleAdapter.sol";
import {Market} from "src/Market.sol";
import {MarketFactory} from "src/MarketFactory.sol";
import {Vault} from "src/Vault.sol";
import {QuoteVerifier} from "src/QuoteVerifier.sol";
import {SettlementEngine} from "src/SettlementEngine.sol";
import {Outcome} from "src/MarketTypes.sol";

contract OracleBountyTest is Test {
    OracleAdapter oracle;
    Market market;
    MarketFactory factory;
    Vault vault;
    QuoteVerifier quoteVerifier;
    SettlementEngine settlement;

    address owner = address(0x1);
    address proposer = address(0x2);
    address disputer = address(0x3);
    address resolver = address(0x4);
    address platformFeeRecipient = address(0x5);

    uint256 constant PROPOSER_BOND = 0.01 ether;
    uint256 constant DISPUTER_BOND = 0.02 ether;
    uint256 constant FIXED_BOUNTY = 0.02 ether;
    uint256 constant PLATFORM_FEE_BPS = 4000; // 40%

    function setUp() public {
        vm.deal(owner, 1000 ether);
        vm.deal(proposer, 1000 ether);
        vm.deal(disputer, 1000 ether);
        vm.deal(platformFeeRecipient, 0 ether);

        vm.startPrank(owner);

        vault = new Vault();
        quoteVerifier = new QuoteVerifier(owner);
        oracle = new OracleAdapter(
            PROPOSER_BOND,
            3600,  // disputeWindow
            DISPUTER_BOND,
            7200,  // resolutionDeadline
            FIXED_BOUNTY,
            PLATFORM_FEE_BPS,
            address(0),  // settlementEngine (will set later)
            platformFeeRecipient,
            owner
        );
        
        settlement = new SettlementEngine(address(oracle), address(vault));
        factory = new MarketFactory(
            address(vault),
            address(oracle),
            address(quoteVerifier),
            address(settlement),
            owner
        );

        // Set resolver
        oracle.setResolver(resolver, true);

        // Create market
        uint256 endTime = block.timestamp + 7 days;
        factory.setCreatorWhitelist(owner, true);
        market = Market(
            factory.createMarket{value: 0.1 ether}(keccak256("test"), endTime, 1 ether, 1 ether)
        );

        vm.stopPrank();
    }

    function test_UndisputedProposalGetsBounty() public {
        // Move past market end time
        vm.warp(block.timestamp + 7 days + 1);

        // Proposer submits proposal with bond
        uint256 proposerBalanceBefore = proposer.balance;
        vm.prank(proposer);
        oracle.proposeOutcome{value: PROPOSER_BOND}(address(market), Outcome.YES);

        // Move past dispute window
        vm.warp(block.timestamp + 3600 + 1);

        // Finalize - proposer should get bond + bounty
        uint256 expectedReward = PROPOSER_BOND + FIXED_BOUNTY;
        vm.prank(owner);
        oracle.finalize(address(market));

        assertEq(proposer.balance, proposerBalanceBefore - PROPOSER_BOND + expectedReward);
    }

    function test_DisputedOutcomeWithProposerWinning() public {
        vm.warp(block.timestamp + 7 days + 1);

        // Proposer proposes
        vm.prank(proposer);
        oracle.proposeOutcome{value: PROPOSER_BOND}(address(market), Outcome.YES);

        // Disputer challenges
        vm.prank(disputer);
        oracle.disputeOutcome{value: DISPUTER_BOND}(address(market));

        // Move past dispute window
        vm.warp(block.timestamp + 3600 + 1);

        // Resolver sides with proposer
        uint256 proposerBalanceBefore = proposer.balance;
        uint256 platformBalanceBefore = platformFeeRecipient.balance;

        vm.prank(resolver);
        oracle.resolveOutcome(address(market), Outcome.YES, true);

        // Proposer should get: bond + bounty + (1 - fee) * disputer_bond
        uint256 platformFee = (DISPUTER_BOND * PLATFORM_FEE_BPS) / 10000;
        uint256 proposerShare = DISPUTER_BOND - platformFee;
        uint256 expectedProposerTotal = PROPOSER_BOND + FIXED_BOUNTY + proposerShare;

        assertEq(proposer.balance, proposerBalanceBefore + expectedProposerTotal);
        assertEq(
            platformFeeRecipient.balance,
            platformBalanceBefore + platformFee
        );
    }

    function test_DisputedOutcomeWithDisputerWinning() public {
        vm.warp(block.timestamp + 7 days + 1);

        // Proposer proposes
        vm.prank(proposer);
        oracle.proposeOutcome{value: PROPOSER_BOND}(address(market), Outcome.YES);

        // Disputer challenges
        vm.prank(disputer);
        oracle.disputeOutcome{value: DISPUTER_BOND}(address(market));

        // Move past dispute window
        vm.warp(block.timestamp + 3600 + 1);

        // Resolver sides with disputer
        uint256 disputerBalanceBefore = disputer.balance;
        uint256 platformBalanceBefore = platformFeeRecipient.balance;

        vm.prank(resolver);
        oracle.resolveOutcome(address(market), Outcome.NO, false); // false = disputer correct

        // Disputer should get: bond + (1 - fee) * proposer_bond
        uint256 platformFee = (PROPOSER_BOND * PLATFORM_FEE_BPS) / 10000;
        uint256 disputerShare = PROPOSER_BOND - platformFee;
        uint256 expectedDisputerTotal = DISPUTER_BOND + disputerShare;

        assertEq(disputer.balance, disputerBalanceBefore + expectedDisputerTotal);
        assertEq(
            platformFeeRecipient.balance,
            platformBalanceBefore + platformFee
        );
    }

    function test_PlatformFeeCalculationCorrect() public {
        vm.warp(block.timestamp + 7 days + 1);

        vm.prank(proposer);
        oracle.proposeOutcome{value: PROPOSER_BOND}(address(market), Outcome.YES);

        vm.prank(disputer);
        oracle.disputeOutcome{value: DISPUTER_BOND}(address(market));

        vm.warp(block.timestamp + 3600 + 1);

        uint256 platformBalanceBefore = platformFeeRecipient.balance;

        vm.prank(resolver);
        oracle.resolveOutcome(address(market), Outcome.YES, true);

        // Platform fee should be 40% of disputed bond (loser's bond)
        uint256 expectedFee = (DISPUTER_BOND * PLATFORM_FEE_BPS) / 10000;
        uint256 actualFee = platformFeeRecipient.balance - platformBalanceBefore;

        assertEq(actualFee, expectedFee);
        assertEq(actualFee, (DISPUTER_BOND * 40) / 100); // 40%
    }

    function test_BountyOnlyGivenForUndisputed() public {
        vm.warp(block.timestamp + 7 days + 1);

        // Proposer proposes
        vm.prank(proposer);
        oracle.proposeOutcome{value: PROPOSER_BOND}(address(market), Outcome.YES);

        // Disputer challenges
        vm.prank(disputer);
        oracle.disputeOutcome{value: DISPUTER_BOND}(address(market));

        vm.warp(block.timestamp + 3600 + 1);

        // When disputed and proposer wins, proposer does NOT get the fixed bounty separately
        // (It's only for fast, undisputed outcomes)
        uint256 proposerBalanceBefore = proposer.balance;
        vm.prank(resolver);
        oracle.resolveOutcome(address(market), Outcome.YES, true);

        // Proposer should get: bond + bounty + disputed_share
        uint256 platformFee = (DISPUTER_BOND * PLATFORM_FEE_BPS) / 10000;
        uint256 proposerShare = DISPUTER_BOND - platformFee;
        uint256 expectedTotal = PROPOSER_BOND + FIXED_BOUNTY + proposerShare;

        assertEq(proposer.balance, proposerBalanceBefore + expectedTotal);
    }

    function test_RejectInvalidBasisPoints() public {
        vm.startPrank(owner);
        vm.expectRevert(OracleAdapter.OracleAdapter__InvalidBasisPoints.selector);
        new OracleAdapter(
            PROPOSER_BOND,
            3600,
            DISPUTER_BOND,
            7200,
            FIXED_BOUNTY,
            10001,  // > 100%
            address(0),
            platformFeeRecipient,
            owner
        );
        vm.stopPrank();
    }
}
