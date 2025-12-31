// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/**
 * @title Vault
 * @author Rahul Dindigala
 * @notice Secure ETH custody contract for prediction markets
 * @dev Manages ETH deposits and withdrawals for individual markets with access control
 */
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract Vault is ReentrancyGuard {
    //////////////////////////
    /// STATE VARIABLES //////
    //////////////////////////
    address public immutable i_settlementEngine;
    address public immutable i_marketFactory;

    mapping(address market => uint256 balance) private marketBalances;
    mapping(address market => bool isValid) private validMarkets;

    //////////////////////////
    /// EVENTS //////
    //////////////////////////
    event Deposited(address indexed market, address indexed sender, uint256 indexed amount);
    event Withdrawn(address indexed market, address indexed recipient, uint256 indexed amount);

    //////////////////////////
    /// ERRORS  //////
    //////////////////////////
    error Vault__NotAuthorized();
    error Vault__InvalidMarket();
    error Vault__InsufficientBalance();
    error Vault__ZeroETHAmount();
    error Vault__ETHTransferFailed();
    error Vault__OnlyFactory();
    error Vault__InvalidAddress();

    //////////////////////////
    /// MODIFIERS //////
    //////////////////////////
    modifier onlySettlementEngine() {
        if (msg.sender != i_settlementEngine) {
            revert Vault__NotAuthorized();
        }
        _;
    }

    modifier onlyFactory() {
        if (msg.sender != i_marketFactory) {
            revert Vault__OnlyFactory();
        }
        _;
    }

    modifier nonZeroETHAmount(uint256 _amount) {
        if (_amount == 0) {
            revert Vault__ZeroETHAmount();
        }
        _;
    }

    //////////////////////////
    /// FUNCTIONS //////
    //////////////////////////
    /**
     * @notice Initialize the Vault contract
     * @param _settlementEngine Address of the SettlementEngine contract
     * @param _marketFactory Address of the MarketFactory contract
     */
    constructor(address _settlementEngine, address _marketFactory) {
        if (_settlementEngine == address(0) || _marketFactory == address(0)) {
            revert Vault__InvalidAddress();
        }
        i_settlementEngine = _settlementEngine;
        i_marketFactory = _marketFactory;
    }

    /**
     * @notice Register a market as valid for deposits
     * @dev Only callable by MarketFactory when creating new markets
     * @param market The market address to register
     * @custom:reverts Vault__InvalidMarket If market address is zero
     */
    function registerMarket(address market) external onlyFactory {
        if (market == address(0)) {
            revert Vault__InvalidMarket();
        }
        validMarkets[market] = true;
    }

    //////////////////////////
    /// External Functions ///
    //////////////////////////
    /**
     * @notice Deposit ETH to a market's vault balance
     * @dev Only registered markets can receive deposits
     * @param market The market address to deposit to
     * @custom:reverts Vault__InvalidMarket If market is not registered or is zero address
     * @custom:reverts Vault__ZeroETHAmount If no ETH is sent
     */
    function deposit(address market) external payable nonZeroETHAmount(msg.value) {
        if (market == address(0)) {
            revert Vault__InvalidMarket();
        }
        if (!validMarkets[market]) {
            revert Vault__InvalidMarket();
        }
        marketBalances[market] += msg.value;

        emit Deposited(market, msg.sender, msg.value);
    }

    /**
     * @notice Withdraw ETH from a market's vault balance
     * @dev Only callable by SettlementEngine during redemption
     * @param market The market address to withdraw from
     * @param recipient The address to send ETH to
     * @param amount The amount of ETH to withdraw
     * @custom:reverts Vault__InsufficientBalance If market balance is less than amount
     * @custom:reverts Vault__ETHTransferFailed If ETH transfer fails
     */
    function withdraw(address market, address recipient, uint256 amount)
        external
        nonReentrant
        onlySettlementEngine
        nonZeroETHAmount(amount)
    {
        uint256 marketBalance = marketBalances[market];
        if (marketBalance < amount) {
            revert Vault__InsufficientBalance();
        }

        marketBalances[market] -= amount;

        (bool success,) = recipient.call{value: amount}("");
        if (!success) {
            revert Vault__ETHTransferFailed();
        }

        emit Withdrawn(market, recipient, amount);
    }

    /**
     * @notice Withdraw ETH from a market's vault balance on sell trades
     * @dev Callable by the registered Market contract itself to refund sellers
     * @param recipient The address to send ETH to
     * @param amount The amount of ETH to withdraw
     */
    function marketWithdraw(address recipient, uint256 amount)
        external
        nonReentrant
        nonZeroETHAmount(amount)
    {
        // Caller must be a registered market
        if (!validMarkets[msg.sender]) {
            revert Vault__InvalidMarket();
        }

        uint256 marketBalance = marketBalances[msg.sender];
        if (marketBalance < amount) {
            revert Vault__InsufficientBalance();
        }

        marketBalances[msg.sender] -= amount;

        (bool success,) = recipient.call{value: amount}("");
        if (!success) {
            revert Vault__ETHTransferFailed();
        }

        emit Withdrawn(msg.sender, recipient, amount);
    }

    //////////////////////////
    /// View Functions ///
    //////////////////////////
    /**
     * @notice Get the ETH balance for a specific market
     * @param market The market address to query
     * @return uint256 The ETH balance held for the market
     */
    function balanceOf(address market) external view returns (uint256) {
        return marketBalances[market];
    }
}
