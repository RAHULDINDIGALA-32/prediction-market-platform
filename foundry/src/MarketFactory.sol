// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/**
 * @title MarketFactory
 * @author Rahul Dindigala
 * @notice Factory contract for creating and managing prediction markets
 * @dev Handles market creation, whitelisting, creator subsidies, and prevents duplicate markets
 */
import {Market} from "./Market.sol";
import {Vault} from "./Vault.sol";
import {OracleAdapter} from "./OracleAdapter.sol";
import {OracleBudget} from "./OracleBudget.sol";
import {PlatformTreasury} from "./PlatformTreasury.sol";
import {QuoteVerifier} from "./QuoteVerifier.sol";
import {SettlementEngine} from "./SettlementEngine.sol";

contract MarketFactory {
    //////////////////////////
    /// STATE VARIABLES ///
    //////////////////////////
    uint256 public constant MAX_MARKET_DURATION = 365 days;
    uint256 public constant MARKET_CREATION_FEE = 0.03 ether; 

    Vault public immutable i_vault;
    OracleAdapter public immutable i_oracle;
    OracleBudget public immutable i_oracleBudget;
    PlatformTreasury public immutable i_platformTreasury;
    QuoteVerifier public immutable i_quoteVerifier;
    SettlementEngine public immutable i_settlementEngine;
    address public i_owner;

    // Whitelisted market creators
    mapping(address creator => bool isWhitelisted) public whitelistedCreators;
    
    // Track creator deposits (subsidy tracking)
    mapping(address market => address creator) public marketCreator;
    mapping(address market => uint256 subsidy) public marketSubsidy;

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
        address creator,
        uint256 subsidy
    );
    event CreatorWhitelisted(address indexed creator, bool isWhitelisted);

    //////////////////////////
    /// ERRORS ///
    //////////////////////////
    error MarketFactory__DuplicateMarket();
    error MarketFactory__InvalidEndTime();
    error MarketFactory__InvalidAddress();
    error MarketFactory__DurationTooLong();
    error MarketFactory__NotWhitelisted();
    error MarketFactory__InsufficientFee();
    error MarketFactory__InvalidSubsidy();
    error MarketFactory__Unauthorized();

    //////////////////////////
    /// MODIFIERS ///
    //////////////////////////
    modifier onlyOwner() {
        if (msg.sender != i_owner) {
            revert MarketFactory__Unauthorized();
        }
        _;
    }

    //////////////////////////
    /// FUNCTIONS ///
    //////////////////////////

    /**
     * @notice Initialize the MarketFactory contract
     * @param _vault Address of the Vault contract
     * @param _oracle Address of the OracleAdapter contract
     * @param _oracleBudget Address of the OracleBudget contract
     * @param _platformTreasury Address of the PlatformTreasury contract
     * @param _quoteVerifier Address of the QuoteVerifier contract
     * @param _settlementEngine Address of the SettlementEngine contract
     * @param _owner Address that will own the contract
     */
    constructor(
        address _vault,
        address _oracle,
        address _oracleBudget,
        address _platformTreasury,
        address _quoteVerifier,
        address _settlementEngine,
        address _owner
    ) {
        if (
            _vault == address(0)
            || _oracle == address(0)
            || _oracleBudget == address(0)
            || _platformTreasury == address(0)
            || _quoteVerifier == address(0)
            || _settlementEngine == address(0)
            || _owner == address(0)
        ) {
            revert MarketFactory__InvalidAddress();
        }
        i_vault = Vault(_vault);
        i_oracle = OracleAdapter(_oracle);
        i_oracleBudget = OracleBudget(_oracleBudget);
        i_platformTreasury = PlatformTreasury(_platformTreasury);
        i_quoteVerifier = QuoteVerifier(_quoteVerifier);
        i_settlementEngine = SettlementEngine(_settlementEngine);
        i_owner = _owner;
    }

    //////////////////////////
    /// External Functions ///
    //////////////////////////
    
    /**
     * @notice Whitelist or remove a market creator
     * @param creator Address of the market creator
     * @param allowed True to whitelist, false to revoke
     */
    function setCreatorWhitelist(address creator, bool allowed) external onlyOwner {
        if (creator == address(0)) {
            revert MarketFactory__InvalidAddress();
        }
        whitelistedCreators[creator] = allowed;
        emit CreatorWhitelisted(creator, allowed);
    }

    /**
     * @notice Create a new prediction market with subsidy
     * @dev Creator must be whitelisted. Requires creation fee (0.03 ETH) and subsidy deposit.
     *      Subsidy = b * ln(2) ensures LMSR solvency.
     *      Fee split: 0.02 ETH -> OracleBudget, 0.01 ETH -> PlatformTreasury
     * @param metadataHash Hash of the market metadata (used to prevent duplicates)
     * @param endTime Unix timestamp when the market expires
     * @param lmsrB LMSR liquidity parameter (b value)
     * @param subsidyAmount Creator's subsidy deposit (should equal b * ln(2) ≈ 0.693 * b)
     * @return market Address of the newly created market contract
     * @custom:reverts MarketFactory__NotWhitelisted If creator is not whitelisted
     * @custom:reverts MarketFactory__InsufficientFee If ETH sent doesn't cover fee + subsidy
     * @custom:reverts MarketFactory__InvalidSubsidy If subsidy is insufficient
     * @custom:reverts MarketFactory__DuplicateMarket If market with same metadataHash exists
     * @custom:reverts MarketFactory__InvalidEndTime If endTime is invalid
     * @custom:reverts MarketFactory__DurationTooLong If market duration exceeds limit
     */
    function createMarket(
        bytes32 metadataHash,
        uint256 endTime,
        uint256 lmsrB,
        uint256 subsidyAmount
    ) external payable returns (address market) {
        // Verify creator is whitelisted
        if (!whitelistedCreators[msg.sender]) {
            revert MarketFactory__NotWhitelisted();
        }

        // Verify payment covers creation fee + subsidy
        uint256 totalRequired = MARKET_CREATION_FEE + subsidyAmount;
        if (msg.value < totalRequired) {
            revert MarketFactory__InsufficientFee();
        }

        // Validate subsidy is reasonable (b * ln(2) = 0.693 * b)
        // Minimum check: subsidy should be at least 69% of b
        uint256 minSubsidy = (lmsrB * 69) / 100;
        if (subsidyAmount < minSubsidy) {
            revert MarketFactory__InvalidSubsidy();
        }

        // Verify metadata and timing
        if (metadataHashToMarket[metadataHash] != address(0)) {
            revert MarketFactory__DuplicateMarket();
        }
        if (endTime <= block.timestamp) {
            revert MarketFactory__InvalidEndTime();
        }
        if (endTime > block.timestamp + MAX_MARKET_DURATION) {
            revert MarketFactory__DurationTooLong();
        }

        // Deploy market
        market = address(
            new Market(
                address(this),
                address(i_vault),
                address(i_quoteVerifier),
                address(i_settlementEngine),
                endTime,
                lmsrB
            )
        );

        // Track creator and subsidy
        marketCreator[market] = msg.sender;
        marketSubsidy[market] = subsidyAmount;

        // Register market
        marketToMetadataHash[market] = metadataHash;
        metadataHashToMarket[metadataHash] = market;
        markets.push(market);

        // Register market with vault
        i_vault.registerMarket(market);

        // Deposit subsidy into vault for market
        i_vault.deposit{value: subsidyAmount}(market);

        // Route creation fee: 0.02 ETH -> OracleBudget, 0.01 ETH -> PlatformTreasury
        uint256 oracleBounty = 0.02 ether;
        uint256 platformFee = 0.01 ether;

        i_oracleBudget.fundMarketBounty{value: oracleBounty}(market, oracleBounty);
        i_platformTreasury.depositCreationFee{value: platformFee}(market);

        // Refund any excess ETH
        if (msg.value > totalRequired) {
            (bool success,) = msg.sender.call{value: msg.value - totalRequired}("");
            require(success, "Refund failed");
        }

        emit MarketCreated(market, metadataHash, endTime, msg.sender, subsidyAmount);
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
