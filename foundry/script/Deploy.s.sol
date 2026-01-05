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

        // Example: create markets and emit a mapping file for the dapp CLI to pick up
        // NOTE: Edit `dbMarketIds` with your real DB market IDs before running, or replace this
        string[] memory dbMarketIds = new string[](1);
        dbMarketIds[0] = "REPLACE_WITH_DB_MARKET_ID"; // <-- replace with real DB id

        uint256 endTime = block.timestamp + 1 days;

        // Build JSON mapping
        string memory json = "{";
        for (uint i = 0; i < dbMarketIds.length; i++) {
            bytes32 meta = keccak256(abi.encodePacked(dbMarketIds[i]));
            address mkt = factory.createMarket(meta, endTime);

            string memory addrStr = toHexString(mkt);
            json = string(abi.encodePacked(json, '"', dbMarketIds[i], '":"', addrStr, '"'));
            if (i + 1 < dbMarketIds.length) json = string(abi.encodePacked(json, ','));
        }
        json = string(abi.encodePacked(json, '}'));

        // Write mapping to the dapp folder so the CLI can read it
        vm.writeFile("dapp/deploy/market-mapping.json", json);

        vm.stopBroadcast();
        return address(factory);
    }

    // Utility: convert address to hex string (0x...)
    function toHexString(address account) internal pure returns (string memory) {
        bytes memory data = abi.encodePacked(account);
        bytes memory hexChars = "0123456789abcdef";
        bytes memory str = new bytes(2 + data.length * 2);
        str[0] = '0';
        str[1] = 'x';
        for (uint i = 0; i < data.length; i++) {
            str[2+i*2] = hexChars[uint8(data[i]) >> 4];
            str[3+i*2] = hexChars[uint8(data[i]) & 0x0f];
        }
        return string(str);
    }
}
