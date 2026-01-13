// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/**
 * @title SettlementEngine
 * @author Rahul Dindigala
 * @notice Handles market settlement and token redemption after oracle resolution
 * @dev Manages the final settlement process and ETH payouts to winners
 */
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {OutcomeToken} from "./OutcomeToken.sol";
import {Vault} from "./Vault.sol";
import {OracleAdapter} from "./OracleAdapter.sol";
import {Outcome, MarketState} from "./MarketTypes.sol";
import {Market} from "./Market.sol";
import {MarketFactory} from "./MarketFactory.sol";

contract SettlementEngine is ReentrancyGuard {
    //////////////////////////
    /// STATE VARIABLES ///
    //////////////////////////
    OracleAdapter public immutable i_oracle;
    Vault public immutable i_vault;
    MarketFactory public immutable i_factory;
    uint256 public constant REDEMPTION_PERIOD = 30 days;

    //mapping(address market => bool isSettled) public marketSettled;
    mapping(address market => bool isRedemptionclosed) public redemptionClosed;
    mapping(address market => uint256 resolvedAt) public marketResolvedAt;
    mapping(address market => mapping(address user => uint256 redeemedAmount)) public redeemed;

    //////////////////////////
    /// EVENTS ///
    //////////////////////////
    event MarketResolved(address indexed market, Outcome indexed outcome);
    event RedemptionClosed(address indexed market, uint256 indexed closedAt);
    event CreatorWithdrawn(address indexed market, address indexed creator, uint256 indexed amount);
    event Redeemed(
        address indexed market,
        address indexed user,
        uint256 indexed winningTokenAmount,
        uint256 ethPaid
    );

    //////////////////////////
    /// ERRORS ///
    //////////////////////////
    error SettlementEngine__MarketAlreadySettled();
    error SettlementEngine__MarketAlreadyResolved()
    error SettlementEngine__MarketNotSettled();
    error SettlementEngine__MarketNotResolved();
    error SettlementEngine__OracleOutcomeNotResolved();
    error SettlementEngine__MarketNotExpired();
    error SettlementEngine__InsufficientBalance();
    error SettlementEngine__InsufficientVaultBalance();
    error SettlementEngine__ZeroBalance();
    error SettlementEngine__InvalidAmount();
    error SettlementEngine__InvalidAddress();
    error SettlementEngine__RedemptionWindowNotClosed();
    error SettlementEngine__RedemptionWindowClosed();
    error SettlementEngine__UnauthorizedCreator();
    error SettlementEngine__ETHTransferFailed();

    //////////////////////////
    /// FUNCTIONS ///
    //////////////////////////

    /**
     * @notice Initialize the SettlementEngine contract
     * @param _oracle Address of the OracleAdapter contract
     * @param _vault Address of the Vault contract
     * @param _factory Address of the MarketFactory contract
     */
    constructor(address _oracle, address _vault, address _factory) {
        if (_oracle == address(0) || _vault == address(0) || _factory == address(0)) {
            revert SettlementEngine__InvalidAddress();
        }
        i_oracle = OracleAdapter(_oracle);
        i_vault = Vault(_vault);
        i_factory = MarketFactory(_factory);
    }

    /**
     * @notice Finalize a market after oracle resolution
     * @dev Marks market as RESOLVED (outcome final). Can be called by anyone after oracle finalizes.
     * Sets redemption deadline to 30 days from now.
     * @param market The market address to settle
     * @custom:reverts SettlementEngine__MarketAlreadyResolved If market already resolved
     * @custom:reverts SettlementEngine__MarketNotExpired If market hasn't expired
     * @custom:reverts SettlementEngine__OracleOutcomeNotResolved If oracle hasn't finalized outcome
     */
    function resolveMarket(address market) external {
        if (marketResolvedAt[market] != 0) {
            revert SettlementEngine__MarketAlreadyResolved();
        }
        Market marketContract = Market(market);

        if (!marketContract.isClosedOrExpired()) {
            revert SettlementEngine__MarketNotExpired();
        }
        if (!i_oracle.isFinalized(market)) {
            revert SettlementEngine__OracleOutcomeNotResolved();
        }

        Outcome outcome = i_oracle.getFinalOutcome(market);

        marketResolvedAt[market] = block.timestamp;
        
        // resolveMarket() will auto-close the market if expired before settling
        marketContract.resolveMarket(outcome);
        emit MarketResolved(market, outcome);
    }

    /**
     * @notice Close redemption window and allow creator withdrawal
     * @dev Called after REDEMPTION_PERIOD (30 days) has elapsed since resolution.
     * Marks market as SETTLED (final state, no more redemptions).
     * @param market The market address
     * @custom:reverts SettlementEngine__MarketNotResolved If market not yet resolved
     * @custom:reverts SettlementEngine__RedemptionWindowNotClosed If 30 days haven't elapsed
     */
    function closeRedemption(address market) external {
        if (resolvedAt[market] == 0) {
            revert SettlementEngine__MarketNotResolved();
        }

        if (redemptionClosed[market]) {
            // Already closed
            return;
        }
        
        uint256 resolvedAt = marketResolvedAt[market];
        if (block.timestamp < resolvedAt + REDEMPTION_PERIOD) {
            revert SettlementEngine__RedemptionWindowNotClosed();
        }

        Market marketContract = Market(market);
        marketContract.settleMarket();

        redemptionClosed[market] = true;
        emit RedemptionClosed(market, block.timestamp);
    }

    /**
     * @notice Creator withdraws remaining collateral after redemption window closes
     * @dev Calculates creator profit/loss and withdraws remaining ETH from vault.
     * Only callable by original market creator after REDEMPTION_PERIOD elapses.
     * @param market The market address
     * @custom:reverts SettlementEngine__MarketNotResolved If market not yet resolved
     * @custom:reverts SettlementEngine__RedemptionWindowNotClosed If redemption window still open
     * @custom:reverts SettlementEngine__UnauthorizedCreator If caller is not the creator
     */
    function creatorWithdraw(address market) external nonReentrant {
        if (resolvedAt[market] == 0) {
            revert SettlementEngine__MarketNotResolved();
        }
     
        if (!redemptionClosed[market]) {
            revert SettlementEngine__RedemptionWindowNotClosed();
        }

        address creator = i_factory.marketCreator(market);
        if (msg.sender != creator) {
            revert SettlementEngine__UnauthorizedCreator();
        }

        uint256 remainingBalance = i_vault.balanceOf(market);
        
        if (remainingBalance > 0) {
            i_vault.withdraw(market, creator, remainingBalance);
        }

        emit CreatorWithdrawn(market, creator, remainingBalance);
    }

    /**
     * @notice Redeem winning outcome tokens for ETH
     * @dev Supports partial redemptions. Burns tokens and transfers ETH from vault.
     * Only possible while redemption window is open (within 30 days of resolution).
     * @param market The market address to redeem from
     * @param amount The amount of tokens to redeem
     * @custom:reverts SettlementEngine__MarketNotResolved If market not resolved
     * @custom:reverts SettlementEngine__RedemptionWindowNotClosed If redemption window closed
     * @custom:reverts SettlementEngine__InvalidAmount If amount is zero
     * @custom:reverts SettlementEngine__InsufficientBalance If user doesn't have enough tokens
     * @custom:reverts SettlementEngine__InsufficientVaultBalance If vault doesn't have enough ETH
     */
    function redeem(address market, uint256 amount) external nonReentrant {
        if (resolvedAt[market] == 0) {
            revert SettlementEngine__MarketNotResolved();
        }
     
        if (redemptionClosed[market]) {
            revert SettlementEngine__RedemptionWindowClosed();
        }
        if (amount == 0) {
            revert SettlementEngine__InvalidAmount();
        }

        Market marketContract = Market(market);
        Outcome outcome = i_oracle.getFinalOutcome(market);
        address winningToken = marketContract.winningToken(outcome);
        uint256 payoutRate = marketContract.payoutRate();

        OutcomeToken token = OutcomeToken(winningToken);
        uint256 userBalance = token.balanceOf(msg.sender);
        uint256 alreadyRedeemed = redeemed[market][msg.sender];
        uint256 redeemable = userBalance - alreadyRedeemed;

        if (redeemable == 0) {
            revert SettlementEngine__ZeroBalance();
        }
        if (amount > redeemable) {
            revert SettlementEngine__InsufficientBalance();
        }

        uint256 ethToPay = amount * payoutRate;
        if (i_vault.balanceOf(market) < ethToPay) {
            revert SettlementEngine__InsufficientVaultBalance();
        }

        redeemed[market][msg.sender] += amount;

        token.burn(msg.sender, amount);
        i_vault.withdraw(market, msg.sender, ethToPay);

        emit Redeemed(market, msg.sender, amount, ethToPay);
    }
    
}