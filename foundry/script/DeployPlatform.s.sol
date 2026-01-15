// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Script, console2} from "forge-std/Script.sol";

import {Vault} from "../src/Vault.sol";
import {QuoteVerifier} from "../src/QuoteVerifier.sol";
import {OracleAdapter} from "../src/OracleAdapter.sol";
import {OracleBudget} from "../src/OracleBudget.sol";
import {PlatformTreasury} from "../src/PlatformTreasury.sol";
import {SettlementEngine} from "../src/SettlementEngine.sol";
import {MarketFactory} from "../src/MarketFactory.sol";

/**
 * @title DeployPlatformScript
 * @notice Deterministic nonce-based deployment (standard CREATE)
 * @dev Formula: address = keccak256(rlp(deployer, nonce))
 */
contract DeployPlatform is Script {
    uint256 constant PROPOSER_BOND = 0.01 ether;
    uint256 constant DISPUTER_BOND = 0.02 ether;
    uint256 constant DISPUTE_WINDOW = 7 days;
    uint256 constant RESOLUTION_DEADLINE = 3 days;

    function run() external {
        address owner = msg.sender;

        // Get current nonce
        uint256 nonce = vm.getNonce(msg.sender); // works in local testnet
        //uint256 nonce = <your_(EOA, Network)_Nonce>; // Works in testnet & mainnet
        console2.log("Deploying from:", owner);
        console2.log("Starting nonce:", nonce);

        vm.startBroadcast();

        ////////////////////////////////////////////////////////////////
        // Pre-Compute contract addresses using Nonce Strategy   //////
        ////////////////////////////////////////////////////////////////
        // Nonce sequence for msg.sender:
        // 0: PlatformTreasury
        // 1: QuoteVerifier
        // 2: OracleBudget
        // 3: OracleAdapter
        // 4: SettlementEngine
        // 5: Vault
        // 6: MarketFactory

        address treasuryAddr = vm.computeCreateAddress(msg.sender, nonce);
        address quoteVerifierAddr = vm.computeCreateAddress(msg.sender, nonce + 1);
        address oracleBudgetAddr = vm.computeCreateAddress(msg.sender, nonce + 2);
        address oracleAddr = vm.computeCreateAddress(msg.sender, nonce + 3);
        address settlementEngineAddr = vm.computeCreateAddress(msg.sender, nonce + 4);
        address vaultAddr = vm.computeCreateAddress(msg.sender, nonce + 5);
        address factoryAddr = vm.computeCreateAddress(msg.sender, nonce + 6);

        console2.log("Precomputed Addresses:");
        console2.log("  Treasury:", treasuryAddr);
        console2.log("  QuoteVerifier:", quoteVerifierAddr);
        console2.log("  OracleBudget:", oracleBudgetAddr);
        console2.log("  OracleAdapter:", oracleAddr);
        console2.log("  SettlementEngine:", settlementEngineAddr);
        console2.log("  Vault:", vaultAddr);
        console2.log("  MarketFactory:", factoryAddr);

        //////////////////////////////////////////////////////////////////////////
        //  Deploy Contracts in exact nonce order (incrementing automatically) //
        ////////////////////////////////////////////////////////////////////////
        console2.log("\n Deployment Addressess:");
        PlatformTreasury treasury = new PlatformTreasury(owner);
        require(address(treasury) == treasuryAddr, "Treasury nonce mismatch");
        console2.log("  Treasury:", address(treasury));

        QuoteVerifier quoteVerifier = new QuoteVerifier(owner);
        require(address(quoteVerifier) == quoteVerifierAddr, "QuoteVerifier nonce mismatch");
        console2.log("  QuoteVerifier:", address(quoteVerifier));

        OracleBudget oracleBudget = new OracleBudget(oracleAddr, owner);
        require(address(oracleBudget) == oracleBudgetAddr, "OracleBudget nonce mismatch");
        console2.log("  OracleBudget:", address(oracleBudget));

        OracleAdapter oracle = new OracleAdapter(
            PROPOSER_BOND,
            DISPUTE_WINDOW,
            DISPUTER_BOND,
            RESOLUTION_DEADLINE,
            settlementEngineAddr,
            payable(oracleBudgetAddr),
            payable(treasuryAddr),
            owner
        );
        require(address(oracle) == oracleAddr, "OracleAdapter nonce mismatch");
        console2.log("  OracleAdapter:", address(oracle));

        SettlementEngine settlement = new SettlementEngine(oracleAddr, vaultAddr, factoryAddr);
        require(address(settlement) == settlementEngineAddr, "SettlementEngine nonce mismatch");
        console2.log("  SettlementEngine:", address(settlement));

        Vault vault = new Vault(settlementEngineAddr, factoryAddr);
        require(address(vault) == vaultAddr, "Vault nonce mismatch");
        console2.log("  Vault:", address(vault));

        MarketFactory factory = new MarketFactory(
            vaultAddr,
            oracleAddr,
            payable(oracleBudgetAddr),
            payable(treasuryAddr),
            quoteVerifierAddr,
            settlementEngineAddr,
            owner
        );
        require(address(factory) == factoryAddr, "MarketFactory nonce mismatch");
        console2.log("  MarketFactory:", address(factory));

        vm.stopBroadcast();

        console2.log("\n Protocol deployed successfully!");
    }
}
