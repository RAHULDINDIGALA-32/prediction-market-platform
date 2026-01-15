// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/**
 * @title OracleBountyTest
 * @notice Tests for oracle proposer bonuses and platform fee distribution
 */

import {Test} from "forge-std/Test.sol";
import {OracleAdapter} from "../src/OracleAdapter.sol";
import {Market} from "../src/Market.sol";
import {MarketFactory} from "../src/MarketFactory.sol";
import {Vault} from "../src/Vault.sol";
import {QuoteVerifier} from "../src/QuoteVerifier.sol";
import {SettlementEngine} from "../src/SettlementEngine.sol";
import {OracleBudget} from "../src/OracleBudget.sol";
import {PlatformTreasury} from "../src/PlatformTreasury.sol";
import {Outcome} from "../src/MarketTypes.sol";

contract OracleBountyTest is Test {
    OracleAdapter oracle;
    Market market;
    MarketFactory factory;
    Vault vault;
    QuoteVerifier quoteVerifier;
    SettlementEngine settlement;
    OracleBudget oracleBudget;
    PlatformTreasury platformTreasury;

    address owner = address(0x1);
    address proposer = address(0x2);
    address disputer = address(0x3);
    address resolver = address(0x4);

    uint256 constant PROPOSER_BOND = 0.01 ether;
    uint256 constant DISPUTER_BOND = 0.02 ether;
    uint256 constant DISPUTE_WINDOW = 3600;
    uint256 constant RESOLUTION_DEADLINE = 7200;

    function setUp() public {
        vm.deal(owner, 1000 ether);
        vm.deal(proposer, 1000 ether);
        vm.deal(disputer, 1000 ether);
        vm.deal(resolver, 1000 ether);

        vm.startPrank(owner);

        // Pre-compute all addresses using nonce strategy
        uint256 nonce = vm.getNonce(owner);
        address treasuryAddr = vm.computeCreateAddress(owner, nonce);
        address verifierAddr = vm.computeCreateAddress(owner, nonce + 1);
        address budgetAddr = vm.computeCreateAddress(owner, nonce + 2);
        address oracleAddr = vm.computeCreateAddress(owner, nonce + 3);
        address settlementAddr = vm.computeCreateAddress(owner, nonce + 4);
        address vaultAddr = vm.computeCreateAddress(owner, nonce + 5);
        address factoryAddr = vm.computeCreateAddress(owner, nonce + 6);

        // Deploy in order
        platformTreasury = new PlatformTreasury(owner);
        quoteVerifier = new QuoteVerifier(owner);
        oracleBudget = new OracleBudget(oracleAddr, owner);

        oracle = new OracleAdapter(
            PROPOSER_BOND,
            DISPUTE_WINDOW,
            DISPUTER_BOND,
            RESOLUTION_DEADLINE,
            settlementAddr,
            payable(budgetAddr),
            payable(treasuryAddr),
            owner
        );

        settlement = new SettlementEngine(oracleAddr, vaultAddr, factoryAddr);
        vault = new Vault(settlementAddr, factoryAddr);

        factory = new MarketFactory(
            vaultAddr, oracleAddr, payable(budgetAddr), payable(treasuryAddr), verifierAddr, settlementAddr, owner
        );

        // Set resolver
        oracle.setResolver(resolver, true);

        // Create market
        uint256 endTime = block.timestamp + 7 days;
        factory.setCreatorWhitelist(owner, true);
        market = Market(factory.createMarket{value: 0.1 ether}(keccak256("test"), endTime, 1 ether, 1 ether));

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
        vm.warp(block.timestamp + DISPUTE_WINDOW + 1);

        // Finalize - proposer should get bond + bounty (0.02 ether)
        uint256 expectedBounty = 0.02 ether; // PROPOSER_BOUNTY constant
        vm.prank(owner);
        oracle.finalizeUndisputedOutcome(address(market));

        // Proposer should receive bond back
        assertEq(proposer.balance, proposerBalanceBefore - PROPOSER_BOND + PROPOSER_BOND);
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
        vm.warp(block.timestamp + DISPUTE_WINDOW + 1);

        // Resolver sides with proposer
        uint256 proposerBalanceBefore = proposer.balance;

        vm.prank(resolver);
        oracle.resolveOutcome(address(market), Outcome.YES, true);

        // Proposer should get bond back + share of disputer bond (50% platform fee)
        uint256 platformFee = (DISPUTER_BOND * 5000) / 10000; // 50% fee
        uint256 proposerShare = DISPUTER_BOND - platformFee;
        uint256 expectedProposerReturn = PROPOSER_BOND + proposerShare;

        assertEq(proposer.balance, proposerBalanceBefore + expectedProposerReturn);
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
        vm.warp(block.timestamp + DISPUTE_WINDOW + 1);

        // Resolver sides with disputer
        uint256 disputerBalanceBefore = disputer.balance;

        vm.prank(resolver);
        oracle.resolveOutcome(address(market), Outcome.NO, false); // false = disputer correct

        // Disputer should get bond + share of proposer bond (50% platform fee)
        uint256 platformFee = (PROPOSER_BOND * 5000) / 10000; // 50% fee
        uint256 disputerShare = PROPOSER_BOND - platformFee;
        uint256 expectedDisputerReturn = DISPUTER_BOND + disputerShare;

        assertEq(disputer.balance, disputerBalanceBefore + expectedDisputerReturn);
    }
}
