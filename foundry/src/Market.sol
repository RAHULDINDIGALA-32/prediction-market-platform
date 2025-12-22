// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/**
 * @title Market
 * @author Rahul Dindigala
 * @notice A binary prediction market contract that manages trading, state transitions, and outcome tokens
 * @dev This contract handles the lifecycle of a prediction market from creation to settlement
 */
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

import {OutcomeToken} from "./OutcomeToken.sol";
import {MarketState, Outcome, TradeQuote} from "./MarketTypes.sol";
import {Vault} from "./Vault.sol";
import {QuoteVerifier} from "./QuoteVerifier.sol";

contract Market is ReentrancyGuard, Pausable {
    //////////////////////////
    /// STATE VARIABLES //////
    //////////////////////////
    uint256 private constant PAYOUT_PER_TOKEN = 1 ether;

    Vault public immutable i_vault;
    QuoteVerifier public immutable i_quoteVerifier;
    OutcomeToken public immutable i_yesToken;
    OutcomeToken public immutable i_noToken;

    address public immutable i_factory;
    address public immutable i_settlementEngine;

    MarketState public state;
    uint256 public immutable i_endTime;

    mapping(bytes32 quoteHash => bool isUsed) public usedQuoteHashes;

    //////////////////////////
    /// EVENTS //////
    //////////////////////////
    event TradeExecuted(
        address indexed trader,
        Outcome indexed outcome,
        uint256 indexed amount,
        uint256 cost,
        bytes32 quoteHash
    );

    event MarketClosed(uint256 indexed timestamp);
    event MarketSettled(Outcome indexed outcome);

    //////////////////////////
    /// ERRORS //////
    //////////////////////////
    error Market__MarketNotOpen();
    error Market__InvalidETHAmount();
    error Market__MarketExpired();
    error Market__MarketNotExpired();
    error Market__QuoteAlreadyUsed();
    error Market__Unauthorized();
    error Market__MarketNotClosed();
    error Market__InvalidAddress();
    error Market__SlippageExceeded();

    //////////////////////////
    /// MODIFIERS //////
    //////////////////////////
    modifier onlyFactory() {
        if (msg.sender != i_factory) {
            revert Market__Unauthorized();
        }
        _;
    }

    modifier onlySettlementEngineOrFactory() {
        if (msg.sender != i_settlementEngine && msg.sender != i_factory) {
            revert Market__Unauthorized();
        }
        _;
    }

    modifier onlyOpen() {
        _ensureClosedIfExpired();
        
        if (state != MarketState.OPEN) {
            revert Market__MarketNotOpen();
        }
        _;
    }

    modifier notExpired() {
        if (block.timestamp >= i_endTime) {
            revert Market__MarketExpired();
        }
        _;
    }

    //////////////////////////
    /// FUNCTIONS //////
    //////////////////////////
    /**
     * @notice Initialize a new prediction market
     * @param _factory Address of the MarketFactory contract
     * @param _vault Address of the Vault contract for ETH custody
     * @param _quoteVerifier Address of the QuoteVerifier contract
     * @param _settlementEngine Address of the SettlementEngine contract
     * @param _endTime Unix timestamp when the market expires
     */
    constructor(address _factory, address _vault, address _quoteVerifier, address _settlementEngine, uint256 _endTime) {
        if (_factory == address(0) || _vault == address(0) || _quoteVerifier == address(0) || _settlementEngine == address(0)) {
            revert Market__InvalidAddress();
        }
        i_factory = _factory;
        i_settlementEngine = _settlementEngine;
        i_vault = Vault(_vault);
        i_quoteVerifier = QuoteVerifier(_quoteVerifier);
        i_endTime = _endTime;

        i_yesToken = new OutcomeToken("Yes Token", "YES", address(this), _settlementEngine);
        i_noToken = new OutcomeToken("No Token", "NO", address(this), _settlementEngine);

        state = MarketState.OPEN;
    }

    //////////////////////////
    /// External Functions ///
    //////////////////////////
    /**
     * @notice Execute a trade by purchasing outcome tokens
     * @dev Verifies the quote signature, checks slippage, mints tokens, and deposits ETH to vault
     * @param quote The trade quote containing trade details
     * @param signature The EIP-712 signature of the quote
     * @param minAmountOut Minimum amount of tokens expected (slippage protection)
     * @custom:reverts Market__InvalidETHAmount If sent ETH doesn't match quote cost
     * @custom:reverts Market__QuoteAlreadyUsed If quote hash was already used
     * @custom:reverts Market__SlippageExceeded If received tokens are less than minAmountOut
     */
    function executeTrade(TradeQuote calldata quote, bytes calldata signature, uint256 minAmountOut)
        external
        payable
        nonReentrant
        whenNotPaused
        onlyOpen
        notExpired
    {
        if (msg.value != quote.cost) {
            revert Market__InvalidETHAmount();
        }

        bytes32 quoteHash = i_quoteVerifier.verifyTradeQuote(quote, signature);

        if (usedQuoteHashes[quoteHash]) {
            revert Market__QuoteAlreadyUsed();
        }
        usedQuoteHashes[quoteHash] = true;

        // Update nonce after successful verification
        i_quoteVerifier.updateNonce(quote.trader, address(this), quote.nonce);

        // Slippage protection: ensure user receives at least minAmountOut tokens
        if (quote.amount < minAmountOut) {
            revert Market__SlippageExceeded();
        }

        if (quote.outcome == Outcome.YES) {
            i_yesToken.mint(msg.sender, quote.amount);
        } else {
            i_noToken.mint(msg.sender, quote.amount);
        }

        i_vault.deposit{value: msg.value}(address(this));

        emit TradeExecuted(msg.sender, quote.outcome, quote.amount, quote.cost, quoteHash);
    }

    /**
     * @notice Manually close the market after expiration
     * @dev Can be called by anyone once the market has expired
     * @custom:reverts Market__MarketNotExpired If market hasn't expired yet
     * @custom:reverts Market__MarketNotOpen If market is not in OPEN state
     */
    function closeMarket() external {
        if (block.timestamp < i_endTime) {
            revert Market__MarketNotExpired();
        }
        if (state != MarketState.OPEN) {
            revert Market__MarketNotOpen();
        }

        state = MarketState.CLOSED;
        emit MarketClosed(block.timestamp);
    }

 

    /**
     * @notice Settle the market with a final outcome
     * @dev Can only be called by SettlementEngine or Factory. Auto-closes market if expired.
     * @param outcome The final outcome (YES or NO) for the market
     * @custom:reverts Market__MarketNotClosed If market is not closed or expired
     */
    function settleMarket(Outcome outcome) external onlySettlementEngineOrFactory {
        _ensureClosedIfExpired();
        if (state != MarketState.CLOSED) {
            revert Market__MarketNotClosed();
        }
        state = MarketState.SETTLED;
        emit MarketSettled(outcome);
    }

    /**
     * @notice Pause the market, preventing new trades
     * @dev Only callable by the factory owner
     */
    function pause() external onlyFactory {
        _pause();
    }

    /**
     * @notice Unpause the market, allowing trades to resume
     * @dev Only callable by the factory owner
     */
    function unpause() external onlyFactory {
        _unpause();
    }

    //////////////////////////
    /// Internal Functions ///
    //////////////////////////

    /**
     * @notice Auto-close market if expired
     * @dev Internal helper to ensure market state is updated when expired. Called automatically in modifiers.
     */
    function _ensureClosedIfExpired() internal {
        if (state == MarketState.OPEN && block.timestamp >= i_endTime) {
            state = MarketState.CLOSED;
            emit MarketClosed(block.timestamp);
        }
    }

    //////////////////////////
    /// View Functions ///
    //////////////////////////
    /**
     * @notice Get the address of the winning token for a given outcome
     * @param outcome The outcome to check (YES or NO)
     * @return address The address of the corresponding outcome token
     */
    function winningToken(Outcome outcome) external view returns (address) {
        return outcome == Outcome.YES ? address(i_yesToken) : address(i_noToken);
    }

    /**
     * @notice Get the payout rate per token
     * @return uint256 The amount of ETH paid per outcome token (1 ether)
     */
    function payoutRate() external view returns (uint256) {
        return PAYOUT_PER_TOKEN;
    }

    /**
     * @notice Check if market is closed or expired
     * @dev View function to check market readiness for settlement
     * @return bool True if market is closed or expired
     */
    function isClosedOrExpired() external view returns (bool) {
        return state == MarketState.CLOSED || block.timestamp >= i_endTime;
    }

    /**
     * @notice Get comprehensive market information
     * @return state_ Current market state (OPEN, CLOSED, or SETTLED)
     * @return endTime_ Unix timestamp when market expires
     * @return yesToken_ Address of the YES outcome token
     * @return noToken_ Address of the NO outcome token
     * @return vault_ Address of the vault holding market ETH
     * @return isExpired_ Whether the market has expired
     * @return isClosed_ Whether the market is closed
     */
    function getMarketInfo()
        external
        view
        returns (
            MarketState state_,
            uint256 endTime_,
            address yesToken_,
            address noToken_,
            address vault_,
            bool isExpired_,
            bool isClosed_
        )
    {
        return (
            state,
            i_endTime,
            address(i_yesToken),
            address(i_noToken),
            address(i_vault),
            block.timestamp >= i_endTime,
            state == MarketState.CLOSED
        );
    }
}
