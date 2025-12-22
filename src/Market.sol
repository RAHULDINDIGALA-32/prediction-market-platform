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
    OurtcomeToken public immutable i_notoken;

    address public immutable i_factory;

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
    error Market__QuoteAlreadyUsed();
    error Market__Unauthorized();

    //////////////////////////
    /// MODIFIERS //////
    //////////////////////////
    modifier onlyFactory() {
        if (msg.sender != i_factory) {
            revert Market__Unauthorized();
        }
        _;
    }

    modifier onlyOpen() {
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

    modifier checkMarketValidity() {
        if (block.timestamp > i_endTime) {
            state = MarketState.CLOSED;
            revert Market__MarketNotOpen();
        }
        _;
    }

    //////////////////////////
    /// FUNCTIONS //////
    //////////////////////////
    constructor(address _factory, address _vault, address _quoteVerifier, address _settlementEngine, uint256 _endTime) {
        i_factory = _factory;
        i_vault = Vault(_vault);
        i_quoteVerifier = QuoteVerifier(_quoteVerifier);
        i_endTime = _endTime;

        i_yesToken = new OutcomeToken("Yes Token", "YES", address(this), _settlementEngine);
        i_noToken = new OutcomeToken("No Token", "NO", address(this), _settlementEngine);

        state = State.OPEN;
    }

    //////////////////////////
    /// External Functions ///
    //////////////////////////
    function executeTrade(TradeQuote quote, bytes calldata signature)
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

        if (quote.outcome == Outcome.YES) {
            yesToken.mint(msg.sender, quote.amount);
        } else {
            noToken.mint(msg.sender, quote.amount);
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

    function settleMarket(Outcome outcome) external onlyFactory {
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
    /// View Functions ///
    //////////////////////////
    function winningToken(Outcome outcome) external view returns (address) {
        return outcome == Outcome.YES ? address(i_yesToken) : address(i_noToken);
    }

    function payoutRate() external view returns (uint256) {
        return PAYOUT_PER_TOKEN;
    }
}
