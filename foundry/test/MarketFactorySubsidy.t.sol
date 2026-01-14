// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/**
 * @title MarketFactorySubsidyTest
 * @notice Tests for market creator subsidy and whitelisting features
 */

import {Test} from "forge-std/Test.sol";
import {MarketFactory} from "../src/MarketFactory.sol";
import {Market} from "../src/Market.sol";
import {Vault} from "../src/Vault.sol";
import {OracleAdapter} from "../src/OracleAdapter.sol";
import {QuoteVerifier} from "../src/QuoteVerifier.sol";
import {SettlementEngine} from "../src/SettlementEngine.sol";
import {PlatformTreasury} from "../src/PlatformTreasury.sol";
import {OracleBudget} from "../src/OracleBudget.sol";

contract MarketFactorySubsidyTest is Test {
    MarketFactory factory;
    Vault vault;
    OracleAdapter oracle;
    QuoteVerifier quoteVerifier;
    SettlementEngine settlement;

    address owner = address(0x1);
    address creator1 = address(0x2);
    address creator2 = address(0x3);

    bytes32 metadataHash1 = keccak256("metadata1");
    bytes32 metadataHash2 = keccak256("metadata2");

    uint256 constant CREATION_FEE = 0.03 ether;
    uint256 constant MIN_LMSR_B = 1 ether;

    function setUp() public {
        vm.deal(owner, 1000 ether);
        vm.deal(creator1, 1000 ether);
        vm.deal(creator2, 1000 ether);

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
        PlatformTreasury treasury = new PlatformTreasury(owner);
        quoteVerifier = new QuoteVerifier(owner);
        OracleBudget budget = new OracleBudget(oracleAddr, owner);

        oracle = new OracleAdapter(
            0.01 ether, // proposerBond
            3600, // disputeWindow
            0.02 ether, // disputerBond
            3600, // resolutionDeadline
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

        vm.stopPrank();
    }

    function test_WhitelistCreator() public {
        vm.prank(owner);
        factory.setCreatorWhitelist(creator1, true);

        assertTrue(factory.whitelistedCreators(creator1));
    }

    function test_RevokeCreatorWhitelist() public {
        vm.prank(owner);
        factory.setCreatorWhitelist(creator1, true);
        assertTrue(factory.whitelistedCreators(creator1));

        vm.prank(owner);
        factory.setCreatorWhitelist(creator1, false);
        assertFalse(factory.whitelistedCreators(creator1));
    }

    function test_RejectUnwhitelistedCreator() public {
        uint256 endTime = block.timestamp + 7 days;
        uint256 lmsrB = MIN_LMSR_B;
        uint256 subsidy = (lmsrB * 693) / 1000; // 69.3%

        vm.prank(creator1);
        vm.expectRevert(MarketFactory.MarketFactory__NotWhitelisted.selector);
        factory.createMarket{value: CREATION_FEE + subsidy}(metadataHash1, endTime, lmsrB, subsidy);
    }

    function test_CreateMarketWithSubsidy() public {
        // Whitelist creator
        vm.prank(owner);
        factory.setCreatorWhitelist(creator1, true);

        uint256 endTime = block.timestamp + 7 days;
        uint256 lmsrB = MIN_LMSR_B;
        uint256 subsidy = (lmsrB * 693) / 1000;
        uint256 totalPayment = CREATION_FEE + subsidy;

        vm.prank(creator1);
        address market = factory.createMarket{value: totalPayment}(metadataHash1, endTime, lmsrB, subsidy);

        assertNotEq(market, address(0));
        assertEq(factory.marketCreator(market), creator1);
        assertEq(factory.marketSubsidy(market), subsidy);
    }

    function test_RejectInsufficientFee() public {
        vm.prank(owner);
        factory.setCreatorWhitelist(creator1, true);

        uint256 endTime = block.timestamp + 7 days;
        uint256 lmsrB = MIN_LMSR_B;
        uint256 subsidy = (lmsrB * 693) / 1000;
        uint256 insufficientPayment = CREATION_FEE + subsidy - 1 wei;

        vm.prank(creator1);
        vm.expectRevert(MarketFactory.MarketFactory__InsufficientFee.selector);
        factory.createMarket{value: insufficientPayment}(metadataHash1, endTime, lmsrB, subsidy);
    }

    function test_RejectInsufficientSubsidy() public {
        vm.prank(owner);
        factory.setCreatorWhitelist(creator1, true);

        uint256 endTime = block.timestamp + 7 days;
        uint256 lmsrB = MIN_LMSR_B;
        uint256 tooSmallSubsidy = (lmsrB * 50) / 100; // Only 50%

        vm.prank(creator1);
        vm.expectRevert(MarketFactory.MarketFactory__InvalidSubsidy.selector);
        factory.createMarket{value: CREATION_FEE + tooSmallSubsidy}(metadataHash1, endTime, lmsrB, tooSmallSubsidy);
    }

    function test_AccumulateFees() public {
        vm.prank(owner);
        factory.setCreatorWhitelist(creator1, true);

        vm.prank(owner);
        factory.setCreatorWhitelist(creator2, true);

        uint256 endTime = block.timestamp + 7 days;
        uint256 lmsrB = MIN_LMSR_B;
        uint256 subsidy = (lmsrB * 693) / 1000;
        uint256 totalPayment = CREATION_FEE + subsidy;

        vm.prank(creator1);
        factory.createMarket{value: totalPayment}(metadataHash1, endTime, lmsrB, subsidy);

        vm.prank(creator2);
        factory.createMarket{value: totalPayment}(metadataHash2, endTime, lmsrB, subsidy);

        // Note: accumulatedFees tracking removed from factory design
    }

    // test_WithdrawFees removed - withdrawFees function not in factory

    function test_RefundExcessPayment() public {
        vm.prank(owner);
        factory.setCreatorWhitelist(creator1, true);

        uint256 endTime = block.timestamp + 7 days;
        uint256 lmsrB = MIN_LMSR_B;
        uint256 subsidy = (lmsrB * 693) / 1000;
        uint256 totalPayment = CREATION_FEE + subsidy;
        uint256 excess = 1 ether;

        uint256 creatorBalanceBefore = creator1.balance;
        vm.prank(creator1);
        factory.createMarket{value: totalPayment + excess}(metadataHash1, endTime, lmsrB, subsidy);

        uint256 expectedBalance = creatorBalanceBefore - totalPayment;
        assertEq(creator1.balance, expectedBalance);
    }

    function test_OnlyOwnerCanWhitelist() public {
        vm.prank(creator1);
        vm.expectRevert(MarketFactory.MarketFactory__Unauthorized.selector);
        factory.setCreatorWhitelist(creator2, true);
    }

    function test_OnlyOwnerCanWithdrawFees() public {
        // withdrawFees test removed - function not in factory
    }
}
