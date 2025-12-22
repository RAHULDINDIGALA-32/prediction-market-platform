// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

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
    event Deposited(address indexed market, address indexed sender, uint256 amount);
    event Withdrawn(address indexed market, address indexed receipient, uint256 amount);

    //////////////////////////
    /// ERRORS  //////
    //////////////////////////
    error Vault__NotAuthorized();
    error Vault__InvalidMarket();
    error Vault_InsufficientBalance();
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
    constructor(address _settlementEngine, address _marketFactory) {
        if (_settlementEngine == address(0) || _marketFactory == address(0)) {
            revert Vault__InvalidAddress();
        }
        i_settlementEngine = _settlementEngine;
        i_marketFactory = _marketFactory;
    }

    /**
     * @notice Register a market as valid
     * @dev Only callable by MarketFactory
     * @param market The market address to register
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

    function withdraw(address market, address recipient, uint256 amount)
        external
        nonReentrant
        onlySettlementEngine
        nonZeroETHAmount(amount)
    {
        uint256 marketBalance = marketBalances[market];
        if (marketBalance < amount) {
            revert Vault_InsufficientBalance();
        }

        marketBalances[market] -= amount;

        (bool success,) = recipient.call{value: amount}("");
        if (!success) {
            revert Vault__ETHTransferFailed();
        }

        emit Withdrawn(market, recipient, amount);
    }

    //////////////////////////
    /// View Functions ///
    //////////////////////////
    function balanceOf(address market) external view returns (uint256) {
        return marketBalances[market];
    }
}
