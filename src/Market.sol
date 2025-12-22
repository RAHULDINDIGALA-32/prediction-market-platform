// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

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
    event TradeExecuted(address indexed trader, Outcome outcome, uint256 amount, uint256 cost, bytes32 quoteHash);

    event MarketClosed(uint256 timestamp);
    event MarketSettled(Outcome Outcome);

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

 

    function settleMarket(Outcome outcome) external onlySettlementEngineOrFactory {
        _ensureClosedIfExpired();
        if (state != MarketState.CLOSED) {
            revert Market__MarketNotClosed();
        }
        state = MarketState.SETTLED;
        emit MarketSettled(outcome);
    }

    function pause() external onlyFactory {
        _pause();
    }

    function unpause() external onlyFactory {
        _unpause();
    }

    //////////////////////////
    /// Internal Functions ///
    //////////////////////////

       /**
     * @notice Auto-close market if expired
     * @dev Internal helper to ensure market state is updated when expired
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
    function winningToken(Outcome outcome) external view returns (address) {
        return outcome == Outcome.YES ? address(i_yesToken) : address(i_noToken);
    }

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
}
