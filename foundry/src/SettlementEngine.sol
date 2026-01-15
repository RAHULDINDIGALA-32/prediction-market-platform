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

    mapping(address market => bool isRedemptionclosed) public redemptionClosed;
    mapping(address market => uint256 resolvedAt) public marketResolvedAt;
    mapping(address market => mapping(address user => uint256 redeemedAmount)) public redeemed;

    //////////////////////////
    /// EVENTS ///
    //////////////////////////
    event MarketResolved(address indexed market, Outcome indexed outcome);
    event RedemptionClosed(address indexed market, uint256 indexed closedAt);
    event CreatorWithdrawn(address indexed market, address indexed creator, uint256 indexed amount);
    event Redeemed(address indexed market, address indexed user, uint256 indexed winningTokenAmount, uint256 ethPaid);

    //////////////////////////
    /// ERRORS ///
    //////////////////////////
    error SettlementEngine__MarketAlreadyResolved();
    error SettlementEngine__OracleOutcomeNotResolved();
    error SettlementEngine__MarketNotResolved();
    error SettlementEngine__InsufficientBalance();
    error SettlementEngine__InsufficientVaultBalance();
    error SettlementEngine__ZeroBalance();
    error SettlementEngine__InvalidAmount();
    error SettlementEngine__InvalidAddress();
    error SettlementEngine__RedemptionWindowClosed();
    error SettlementEngine__RedemptionWindowNotClosed();
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

    //////////////////////////
    /// External Functions ///
    //////////////////////////

    /**
     * @notice Close redemption window and mark market settled
     * @dev Can be called anytime after 30 days have passed
     * Idempotent: safe to call multiple times
     * Only marks market as settled for record-keeping, doesn't affect redemptions
     * @param market The market address
     * @custom:reverts SettlementEngine__MarketNotResolved If market not yet resolved
     * @custom:reverts SettlementEngine__RedemptionWindowNotClosed If redemption window not yet closed
     */
    function closeRedemption(address market) external {
        _ensureResolved(market);

        if (marketResolvedAt[market] == 0) {
            revert SettlementEngine__MarketNotResolved();
        }

        if (redemptionClosed[market]) {
            return;
        }

        uint256 resolvedAt = marketResolvedAt[market];
        if (block.timestamp < resolvedAt + REDEMPTION_PERIOD) {
            revert SettlementEngine__RedemptionWindowNotClosed();
        }

        redemptionClosed[market] = true;

        Market marketContract = Market(market);
        marketContract.onSettled();

        emit RedemptionClosed(market, block.timestamp);
    }

    /**
     * @notice Creator withdraws remaining collateral after redemption window closes
     * @dev Only callable by original market creator after 30 days pass
     * Automatically resolves market if not yet resolved (lazy evaluation)
     * @param market The market address
     * @custom:reverts SettlementEngine__RedemptionWindowNotClosed If redemption window not yet closed
     * @custom:reverts SettlementEngine__UnauthorizedCreator If caller is not the creator
     */
    function creatorWithdraw(address market) external nonReentrant {
        // Lazy resolution: resolve market if not yet done
        _ensureResolved(market);

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
     * @dev Supports partial redemptions within 30-day redemption window
     * Automatically resolves market on first call after oracle finality
     * Burns tokens and transfers ETH from vault
     * @param market The market address to redeem from
     * @param amount The amount of tokens to redeem
     * @custom:reverts SettlementEngine__RedemptionWindowClosed If window elapsed
     * @custom:reverts SettlementEngine__InvalidAmount If amount is zero
     * @custom:reverts SettlementEngine__InsufficientBalance If insufficient tokens
     * @custom:reverts SettlementEngine__InsufficientVaultBalance If vault depleted
     */
    function redeem(address market, uint256 amount) external nonReentrant {
        // Lazy resolution: resolve market if not yet done
        _ensureResolved(market);

        uint256 resolvedAt = marketResolvedAt[market];
        if (block.timestamp >= resolvedAt + REDEMPTION_PERIOD) {
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

    //////////////////////////
    /// Internal Functions ///
    //////////////////////////

    /**
     * @notice Lazily resolve market on first interaction after oracle finality
     * @dev Implements complete lazy settlement: oracle finalization + market resolution
     * Idempotent: safe to call multiple times
     *
     * Flow:
     * 1. Check if already resolved (quick return)
     * 2. Ensure oracle outcome is finalized (lazy oracle finalization)
     * 3. Record market resolution timestamp
     * 4. Notify Market via callback
     *
     * Called implicitly before: redeem(), creatorWithdraw()
     * @param market The market address
     * @custom:reverts SettlementEngine__OracleOutcomeNotResolved If oracle can't be finalized
     */
    function _ensureResolved(address market) internal {
        if (marketResolvedAt[market] != 0) {
            return;
        }

        // This handles both undisputed (auto-finalize) and disputed (revert) cases
        _ensureOracleFinalized(market);

        // At this point, oracle is guaranteed finalized)
        marketResolvedAt[market] = block.timestamp;

        Outcome outcome = i_oracle.getFinalOutcome(market);

        // Notify Market contract via callback (passive pattern)
        Market(market).onResolved(outcome);

        emit MarketResolved(market, outcome);
    }

    /**
     * @notice Ensure oracle has finalized the outcome
     * @dev Implements lazy oracle finalization pattern:
     * - If already finalized: return (idempotent)
     * - If undisputed and window closed: finalize automatically
     * - If disputed: revert (let resolver handle it)
     * - If window not closed: revert (too early)
     * @param market The market address
     * @custom:reverts SettlementEngine__OracleOutcomeNotResolved If oracle can't be finalized
     */
    function _ensureOracleFinalized(address market) internal {
        if (i_oracle.isFinalized(market)) {
            return;
        }

        _tryFinalizeOracle(market);

        if (!i_oracle.isFinalized(market)) {
            revert SettlementEngine__OracleOutcomeNotResolved();
        }
    }

    /**
     * @notice Attempt to finalize oracle outcome if conditions permit
     * @dev Safe to call multiple times (checks all preconditions)
     * Finalizes if:
     * - Not yet finalized
     * - Not disputed (undisputed case only)
     * - Dispute window has closed
     *
     * Silent return if conditions not met (no-op, caller checks via isFinalized)
     *
     * This is the key to lazy oracle finalization:
     * The system automatically finalizes undisputed outcomes
     * when the dispute window closes, without needing manual intervention.
     *
     * @param market The market address
     */
    function _tryFinalizeOracle(address market) internal {
        bool isAlreadyFinalized = i_oracle.isFinalized(market);
        bool isDisputed = i_oracle.isDisputed(market);
        uint256 proposedAt = i_oracle.getProposalTime(market);

        // Already finalized: nothing to do (idempotent)
        if (isAlreadyFinalized) {
            return;
        }

        if (isDisputed) {
            return;
        }

        // Check if dispute window has closed
        uint256 disputeWindowEnd = proposedAt + i_oracle.getDisputeWindow();
        if (block.timestamp < disputeWindowEnd) {
            return;
        }

        i_oracle.finalizeUndisputedOutcome(market);
    }

    /**
     * @notice Check if redemption window is still open for market
     * @param market The market address
     * @return bool True if within 30 days of resolution
     */
    function isRedemptionOpen(address market) public view returns (bool) {
        uint256 resolved = marketResolvedAt[market];
        return resolved != 0 && block.timestamp < resolved + REDEMPTION_PERIOD;
    }

    /**
     * @notice Check if redemption window has closed
     * @param market The market address
     * @return bool True if past 30 days or not yet resolved
     */
    function isRedemptionClosed(address market) public view returns (bool) {
        uint256 resolved = marketResolvedAt[market];
        return resolved != 0 && block.timestamp >= resolved + REDEMPTION_PERIOD;
    }
}
