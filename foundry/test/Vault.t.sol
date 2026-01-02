// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.17;

import {Test} from "forge-std/Test.sol";
import {Vault} from "../src/Vault.sol";

contract VaultTest is Test {
    Vault vault;
    address factory;

    function setUp() public {
        factory = address(this);
        vault = new Vault(address(0x1234), factory);
    }

    function testRegisterAndDepositWithdraw() public {
        // register market as factory
        address market = address(0xBEEF);
        vault.registerMarket(market);

        // deposit from market (simulate market caller)
        vm.deal(address(1), 1 ether);
        vm.prank(address(1));
        vm.expectRevert();
        // deposit must be from a registered market; this should revert
        // but deposit does not check caller; instead it checks provided market address, so passing invalid market should revert
        // call deposit with invalid market
        (bool ok,) = address(vault).call{value: 1 ether}(abi.encodeWithSelector(vault.deposit.selector, address(0)));
        assertFalse(ok);

        // deposit with valid market
        vm.prank(market);
        // send 0.5 ether as msg.value is validated
        (bool success,) = address(vault).call{value: 0.5 ether}(abi.encodeWithSelector(vault.deposit.selector, market));
        assertTrue(success);

        uint256 bal = vault.balanceOf(market);
        assertEq(bal, 0.5 ether);

        // withdraw onlySettlementEngine should revert when not called by settlement engine
        vm.expectRevert();
        vault.withdraw(market, address(this), 0.1 ether);
    }
}
