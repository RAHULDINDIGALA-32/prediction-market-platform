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

contract SettlementEngine is ReentrancyGuard {
    //////////////////////////
    /// STATE VARIABLES ///
    //////////////////////////
    OracleAdapter public immutable i_oracle;
    Vault public immutable i_vault;

    mapping(address market => bool isSettled) public marketSettled;
    mapping(address market => mapping(address user => uint256 redeemedAmount)) public redeemed;

    //////////////////////////
    /// EVENTS ///
    //////////////////////////
    event MarketSettled(address indexed market, Outcome indexed outcome);
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
    error SettlementEngine__MarketNotSettled();
    error SettlementEngine__MarketNotResolved();
    error SettlementEngine__MarketNotExpired();
    error SettlementEngine__MarketNotClosed();
    error SettlementEngine__InsufficientBalance();
    error SettlementEngine__InsufficientVaultBalance();
    error SettlementEngine__ZeroBalance();
    error SettlementEngine__InvalidAmount();
    error SettlementEngine__InvalidAddress();

    //////////////////////////
    /// FUNCTIONS ///
    //////////////////////////

    /**
     * @notice Initialize the SettlementEngine contract
     * @param _oracle Address of the OracleAdapter contract
     * @param _vault Address of the Vault contract
     */
    constructor(address _oracle, address _vault) {
        if (_oracle == address(0) || _vault == address(0)) {
            revert SettlementEngine__InvalidAddress();
        }
        i_oracle = OracleAdapter(_oracle);
        i_vault = Vault(_vault);
    }

    /**
     * @notice Finalize a market after oracle resolution
     * @dev Marks market as settled and updates market state. Can be called by anyone.
     * @param market The market address to settle
     * @custom:reverts SettlementEngine__MarketAlreadySettled If market already settled
     * @custom:reverts SettlementEngine__MarketNotExpired If market hasn't expired
     * @custom:reverts SettlementEngine__MarketNotClosed If market is not closed or expired
     * @custom:reverts SettlementEngine__MarketNotResolved If oracle hasn't finalized outcome
     */
    function settleMarket(address market) external {
        if (marketSettled[market]) {
            revert SettlementEngine__MarketAlreadySettled();
        }
        Market marketContract = Market(market);
        if (block.timestamp < marketContract.i_endTime()) {
            revert SettlementEngine__MarketNotExpired();
        }
        // Allow settlement if market is closed OR expired (even if not explicitly closed)
        if (!marketContract.isClosedOrExpired()) {
            revert SettlementEngine__MarketNotClosed();
        }
        if (!i_oracle.isFinalized(market)) {
            revert SettlementEngine__MarketNotResolved();
        }

        Outcome outcome = i_oracle.getFinalOutcome(market);

        marketSettled[market] = true;
        // settleMarket() will auto-close the market if expired before settling
        marketContract.settleMarket(outcome);
        emit MarketSettled(market, outcome);
    }

    /**
     * @notice Redeem winning outcome tokens for ETH
     * @dev Supports partial redemptions. Burns tokens and transfers ETH from vault.
     * @param market The market address to redeem from
     * @param amount The amount of tokens to redeem
     * @custom:reverts SettlementEngine__MarketNotSettled If market not settled
     * @custom:reverts SettlementEngine__InvalidAmount If amount is zero
     * @custom:reverts SettlementEngine__InsufficientBalance If user doesn't have enough tokens
     * @custom:reverts SettlementEngine__InsufficientVaultBalance If vault doesn't have enough ETH
     */
    function redeem(address market, uint256 amount) external nonReentrant {
        if (!marketSettled[market]) {
            revert SettlementEngine__MarketNotSettled();
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
