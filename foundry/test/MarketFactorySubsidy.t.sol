// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/**
 * @title MarketFactorySubsidyTest
 * @notice Tests for market creator subsidy and whitelisting features
 */

import {Test} from "forge-std/Test.sol";
import {MarketFactory} from "src/MarketFactory.sol";
import {Market} from "src/Market.sol";
import {Vault} from "src/Vault.sol";
import {OracleAdapter} from "src/OracleAdapter.sol";
import {QuoteVerifier} from "src/QuoteVerifier.sol";
import {SettlementEngine} from "src/SettlementEngine.sol";

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

        vault = new Vault();
        oracle = new OracleAdapter(
            0.01 ether,  // proposerBond
            3600,        // disputeWindow
            0.02 ether,  // disputerBond
            7200,        // resolutionDeadline
            0.02 ether,  // fixedBounty
            4000,        // platformFeeBps (40%)
            address(0),  // settlementEngine (will be set after)
            owner,       // platformFeeRecipient
            owner        // owner
        );
        quoteVerifier = new QuoteVerifier(owner);
        settlement = new SettlementEngine(address(oracle), address(vault));
        
        factory = new MarketFactory(
            address(vault),
            address(oracle),
            address(quoteVerifier),
            address(settlement),
            owner
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
        factory.createMarket{value: CREATION_FEE + subsidy}(
            metadataHash1,
            endTime,
            lmsrB,
            subsidy
        );
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
        address market = factory.createMarket{value: totalPayment}(
            metadataHash1,
            endTime,
            lmsrB,
            subsidy
        );

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
        factory.createMarket{value: insufficientPayment}(
            metadataHash1,
            endTime,
            lmsrB,
            subsidy
        );
    }

    function test_RejectInsufficientSubsidy() public {
        vm.prank(owner);
        factory.setCreatorWhitelist(creator1, true);

        uint256 endTime = block.timestamp + 7 days;
        uint256 lmsrB = MIN_LMSR_B;
        uint256 tooSmallSubsidy = (lmsrB * 50) / 100; // Only 50%

        vm.prank(creator1);
        vm.expectRevert(MarketFactory.MarketFactory__InvalidSubsidy.selector);
        factory.createMarket{value: CREATION_FEE + tooSmallSubsidy}(
            metadataHash1,
            endTime,
            lmsrB,
            tooSmallSubsidy
        );
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

        assertEq(factory.accumulatedFees(), CREATION_FEE * 2);
    }

    function test_WithdrawFees() public {
        vm.prank(owner);
        factory.setCreatorWhitelist(creator1, true);

        uint256 endTime = block.timestamp + 7 days;
        uint256 lmsrB = MIN_LMSR_B;
        uint256 subsidy = (lmsrB * 693) / 1000;
        uint256 totalPayment = CREATION_FEE + subsidy;

        vm.prank(creator1);
        factory.createMarket{value: totalPayment}(metadataHash1, endTime, lmsrB, subsidy);

        uint256 ownerBalanceBefore = owner.balance;
        vm.prank(owner);
        factory.withdrawFees();

        assertEq(owner.balance, ownerBalanceBefore + CREATION_FEE);
        assertEq(factory.accumulatedFees(), 0);
    }

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
        factory.createMarket{value: totalPayment + excess}(
            metadataHash1,
            endTime,
            lmsrB,
            subsidy
        );

        uint256 expectedBalance = creatorBalanceBefore - totalPayment;
        assertEq(creator1.balance, expectedBalance);
    }

    function test_OnlyOwnerCanWhitelist() public {
        vm.prank(creator1);
        vm.expectRevert(MarketFactory.MarketFactory__Unauthorized.selector);
        factory.setCreatorWhitelist(creator2, true);
    }

    function test_OnlyOwnerCanWithdrawFees() public {
        vm.prank(creator1);
        vm.expectRevert(MarketFactory.MarketFactory__Unauthorized.selector);
        factory.withdrawFees();
    }
}
