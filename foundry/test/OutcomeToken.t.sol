// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.17;

import {Test} from "forge-std/Test.sol";
import {OutcomeToken} from "../src/OutcomeToken.sol";

contract OutcomeTokenTest is Test {
    OutcomeToken token;

    function setUp() public {
        // allow this test contract to act as both market and settlement engine
        token = new OutcomeToken("Test", "TST", address(this), address(this));
    }

    function testMintBurnBurnFromUser() public {
        token.mint(address(1), 1 ether);
        assertEq(token.balanceOf(address(1)), 1 ether);

        // burn via settlement engine (this contract)
        token.burn(address(1), 0.5 ether);
        assertEq(token.balanceOf(address(1)), 0.5 ether);

        // burn from user via market (this contract)
        token.burnFromUser(address(1), 0.5 ether);
        assertEq(token.balanceOf(address(1)), 0);
    }

    function testUnauthorizedMintReverts() public {
        // Deploy token with a different market so this contract cannot mint
        OutcomeToken t2 = new OutcomeToken("Test2", "T2", address(0xBEEF), address(this));
        vm.expectRevert();
        t2.mint(address(2), 1 ether);
    }
}
