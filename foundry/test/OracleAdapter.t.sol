// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.17;

import {Test} from "forge-std/Test.sol";
import {OracleAdapter} from "../src/OracleAdapter.sol";
import {Outcome} from "../src/MarketTypes.sol";

contract OracleAdapterTest is Test {
    OracleAdapter oracle;

    function setUp() public {
        // proposerBond=1 wei, disputeWindow=100, disputerBond=1 wei, resolutionDeadline=100
        oracle = new OracleAdapter(1 wei, 100, 1 wei, 100, address(this), address(this));
    }

    function testProposeAndDisputeAndResolve() public {
        // propose outcome with correct bond
        vm.deal(address(1), 1 wei);
        vm.prank(address(1));
        oracle.proposeOutcome{value: 1 wei}(address(0xBEEF), Outcome.YES);

        // cannot propose again
        vm.prank(address(2));
        vm.expectRevert();
        oracle.proposeOutcome{value: 1 wei}(address(0xBEEF), Outcome.NO);

        // dispute within window
        vm.prank(address(3));
        vm.deal(address(3), 1 wei);
        vm.prank(address(3));
        oracle.disputeOutcome{value: 1 wei}(address(0xBEEF));

        // set resolver and resolve
        oracle.setResolver(address(this), true);
        vm.expectEmit(true, true, true, true);
        emit BondRedistributed(address(0xBEEF), address(this), 2 wei);
        vm.prank(address(this));
        oracle.resolveOutcome(address(0xBEEF), Outcome.YES, true);
    }

    event BondRedistributed(address indexed market, address indexed winner, uint256 indexed amount);
}
