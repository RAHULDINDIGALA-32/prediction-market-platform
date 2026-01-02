// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.17;

import {Script} from "forge-std/Script.sol";
import {Vault} from "../src/Vault.sol";
import {QuoteVerifier} from "../src/QuoteVerifier.sol";
import {OracleAdapter} from "../src/OracleAdapter.sol";
import {SettlementEngine} from "../src/SettlementEngine.sol";
import {MarketFactory} from "../src/MarketFactory.sol";

contract DeployScript is Script {
    function run() external returns (address) {
        vm.startBroadcast();

        // Deploy QuoteVerifier with factory owner as deployer
        QuoteVerifier quoteVerifier = new QuoteVerifier(msg.sender);

        // Deploy a Vault with placeholder settlementEngine and factory (will be updated logically via factory)
        Vault vault = new Vault(address(0), msg.sender);

        // Deploy a dummy OracleAdapter and SettlementEngine with temporary addresses
        OracleAdapter oracle = new OracleAdapter(0.01 ether, 1 days, 0.01 ether, 7 days, address(0), msg.sender);

        SettlementEngine settlement = new SettlementEngine(address(oracle), address(vault));

        // Re-deploy Vault with proper settlementEngine and factory
        // Note: Vault constructor requires marketFactory address; using msg.sender as factory for demo
        Vault vault2 = new Vault(address(settlement), msg.sender);

        // Deploy QuoteVerifier (already deployed) and MarketFactory
        MarketFactory factory = new MarketFactory(address(vault2), address(oracle), address(quoteVerifier), address(settlement));

        vm.stopBroadcast();
        return address(factory);
    }
}
