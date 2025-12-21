// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract Vault is ReentrancyGuard {
    //////////////////////////
    /// STATE VARIABLES //////
    //////////////////////////
    address public immutable i_settlementEngine;

    mapping(address market => uint256 balance) private marketBalances;

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

    //////////////////////////
    /// MODIFIERS //////
    //////////////////////////
    modifier onlySettlementEngine() {
        if (msg.sender != i_settlementEngine) {
            revert Vault__NotAuthorized();
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
    constructor(address _settlementEngine) {
        i_settlementEngine = _settlementEngine;
    }

    //////////////////////////
    /// External Functions ///
    //////////////////////////
    function deposit(address market) external payable nonZeroETHAmount(msg.value) {
        if (market == address(0)) {
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
