// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/**
 * @title MarketFactory
 * @author Rahul Dindigala
 * @notice Factory contract for creating and managing prediction markets
 * @dev Handles market creation, registration, and prevents duplicate markets
 */
import {Market} from "./Market.sol";
import {Vault} from "./Vault.sol";
import {OracleAdapter} from "./OracleAdapter.sol";
import {QuoteVerifier} from "./QuoteVerifier.sol";
import {SettlementEngine} from "./SettlementEngine.sol";

contract MarketFactory {
    //////////////////////////
    /// STATE VARIABLES ///
    //////////////////////////
    uint256 public constant MAX_MARKET_DURATION = 365 days;

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
    event MarketCreated(
        address indexed market,
        bytes32 indexed metadataHash,
        uint256 indexed endTime,
        address creator
    );

    //////////////////////////
    /// ERRORS ///
    //////////////////////////
    error MarketFactory__DuplicateMarket();
    error MarketFactory__InvalidEndTime();
    error MarketFactory__InvalidAddress();
    error MarketFactory__DurationTooLong();

    //////////////////////////
    /// FUNCTIONS ///
    //////////////////////////
    /**
     * @notice Initialize the MarketFactory contract
     * @param _vault Address of the Vault contract
     * @param _oracle Address of the OracleAdapter contract
     * @param _quoteVerifier Address of the QuoteVerifier contract
     * @param _settlementEngine Address of the SettlementEngine contract
     */
    constructor(address _vault, address _oracle, address _quoteVerifier, address _settlementEngine) {
        if (_vault == address(0) || _oracle == address(0) || _quoteVerifier == address(0) || _settlementEngine == address(0)) {
            revert MarketFactory__InvalidAddress();
        }
        i_vault = Vault(_vault);
        i_oracle = OracleAdapter(_oracle);
        i_quoteVerifier = QuoteVerifier(_quoteVerifier);
        i_settlementEngine = SettlementEngine(_settlementEngine);
    }

    //////////////////////////
    /// External Functions ///
    //////////////////////////
    /**
     * @notice Create a new prediction market
     * @dev Deploys a new Market contract and registers it with the Vault
     * @param metadataHash Hash of the market metadata (used to prevent duplicates)
     * @param endTime Unix timestamp when the market expires
     * @return market Address of the newly created market contract
     * @custom:reverts MarketFactory__DuplicateMarket If market with same metadataHash already exists
     * @custom:reverts MarketFactory__InvalidEndTime If endTime is in the past
     * @custom:reverts MarketFactory__DurationTooLong If market duration exceeds MAX_MARKET_DURATION
     */
    function createMarket(bytes32 metadataHash, uint256 endTime) external returns (address market) {
        if (metadataHashToMarket[metadataHash] != address(0)) {
            revert MarketFactory__DuplicateMarket();
        }
        if (endTime <= block.timestamp) {
            revert MarketFactory__InvalidEndTime();
        }
        if (endTime > block.timestamp + MAX_MARKET_DURATION) {
            revert MarketFactory__DurationTooLong();
        }

        market = address(
            new Market(address(this), address(i_vault), address(i_quoteVerifier), address(i_settlementEngine), endTime)
        );

        marketToMetadataHash[market] = metadataHash;
        metadataHashToMarket[metadataHash] = market;
        markets.push(market);

        // Register market with Vault
        i_vault.registerMarket(market);

        emit MarketCreated(market, metadataHash, endTime, msg.sender);
    }

    ////////////////////////
    /// View Functions ///
    //////////////////////////
    /**
     * @notice Get all created market addresses
     * @return address[] Array of all market addresses
     */
    function getAllMarkets() external view returns (address[] memory) {
        return markets;
    }

    /**
     * @notice Get the metadata hash for a specific market
     * @param market The market address to query
     * @return bytes32 The metadata hash associated with the market
     */
    function getMarketMetadataHash(address market) external view returns (bytes32) {
        return marketToMetadataHash[market];
    }

    /**
     * @notice Check if an address is a valid market created by this factory
     * @param market The address to check
     * @return bool True if the address is a valid market
     */
    function isValidMarket(address market) external view returns (bool) {
        return marketToMetadataHash[market] != bytes32(0);
    }
}
