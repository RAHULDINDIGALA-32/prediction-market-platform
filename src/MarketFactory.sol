// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Market} from "./Market.sol";
import {Vault} from "./Vault.sol";
import {OracleAdapter} from "./OracleAdapter.sol";
import {QuoteVerifier} from "./QuoteVerifier.sol";
import {SettlementEngine} from "./SettlementEngine.sol";

contract MarketFactory {
    //////////////////////////
    /// STATE VARIABLES ///
    //////////////////////////
    Vault public immutable i_vault;
    OracleAdapter public immutable i_oracle;
    QuoteVerifier public immutable i_quoteVerifier;
    SettlementEngine public immutable i_settlementEngine;

    mapping(address market => bytes32 mateHash) public marketToMetadataHash;

    /// metadata hash → market (prevent duplicates)
    mapping(bytes32 metaHash => address market) public metadataHashToMarket;

    address[] public markets;

    //////////////////////////
    /// EVENTS ///
    event MarketCreated(address indexed market, bytes32 indexed metadataHash, uint256 endTime);

    //////////////////////////
    /// ERRORS ///
    //////////////////////////
    error MarketFactory__DuplicateMarket();
    error MarketFactory__InvalidEndTime();

    //////////////////////////
    /// FUNCTIONS ///
    //////////////////////////
    constructor(address _vault, address _oracle, address _quoteVerifier, address _settlementEngine) {
        i_vault = Vault(_vault);
        i_oracle = OracleAdapter(_oracle);
        i_quoteVerifier = QuoteVerifier(_quoteVerifier);
        i_settlementEngine = SettlementEngine(_settlementEngine);
    }

    //////////////////////////
    /// External Functions ///
    //////////////////////////
    function createMarket(bytes32 metadataHash, uint256 endTime) external returns (address market) {
        if (metadataHashToMarket[metadataHash] != address(0)) {
            revert MarketFactory__DuplicateMarket();
        }
        if (endTime <= block.timestamp) {
            revert MarketFactory__InvalidEndTime();
        }

        market = address(
            new Market(address(this), address(i_vault), address(i_quoteVerifier), address(i_settlementEngine), endTime)
        );

        marketToMetadataHash[market] = metadataHash;
        metadataHashToMarket[metadataHash] = market;
        markets.push(market);

        emit MarketCreated(market, metadataHash, endTime);
    }

    ////////////////////////
    /// View Functions ///
    //////////////////////////
    function getAllMarkets() external view returns (address[] memory) {
        return markets;
    }

    function getMarketMetadataHash(address market) external view returns (bytes32) {
        return marketToMetadataHash[market];
    }
}
