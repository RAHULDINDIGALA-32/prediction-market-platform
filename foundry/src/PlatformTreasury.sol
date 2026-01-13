// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/**
 * @title PlatformTreasury
 * @author Rahul Dindigala
 * @notice Treasury for platform revenue collection and management
 * @dev Stores platform fees from market creation and dispute resolution
 * Ready for governance integration
 */
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract PlatformTreasury is ReentrancyGuard, Ownable {
    //////////////////////////
    /// STATE VARIABLES ///
    //////////////////////////

    uint256 public totalFees;
    /// Fees by source (for accounting)
    uint256 public accruedCreationFee;
    uint256 public accruedDisputeFee;

    //////////////////////////
    /// EVENTS ///
    //////////////////////////
    event CreationFeeDeposited(address indexed market, uint256 indexed amount);
    event DisputeFeeDeposited(address indexed market, uint256 indexed amount);
    event FeeWithdrawn(address indexed recipient, uint256 indexed amount);

    //////////////////////////
    /// ERRORS ///
    //////////////////////////
    error PlatformTreasury__InvalidAddress();
    error PlatformTreasury__InvalidAmount();
    error PlatformTreasury__InsufficientBalance();
    error PlatformTreasury__ETHTransferFailed();

    //////////////////////////
    /// FUNCTIONS ///
    //////////////////////////

    /**
     * @notice Initialize PlatformTreasury
     * @param _owner Address of contract owner 
     */
    constructor(address _owner) Ownable(_owner) {
        if (_owner == address(0)) {
            revert PlatformTreasury__InvalidAddress();
        }
    }

    /**
     * @notice Deposit platform fees from market creation
     * @dev Called by MarketFactory when market is created
     * @param market The market address fee is for
     */
    function depositCreationFee(address market) external payable nonReentrant {
        if (msg.value == 0) {
            revert PlatformTreasury__InvalidAmount();
        }

        totalFees += msg.value;
        accruedCreationFee += msg.value;

        emit FeeDeposited(market, msg.value);
    }

    /**
     * @notice Deposit fees from disputed bond resolution
     * @dev Called by OracleAdapter when dispute is resolved
     * @param source The source of the fee (e.g., "DISPUTE_RESOLUTION")
     */
    function depositDisputeFee(address market) external payable nonReentrant {
        if (msg.value == 0) {
            revert PlatformTreasury__InvalidAmount();
        }

        totalFees += msg.value;
        accruedDisputeFee += msg.value;

        emit DisputeFeeDeposited(market, msg.value);
    }

    /**
     * @notice Withdraw funds from treasury (owner only)
     * @param recipient Address to receive funds
     * @param amount Amount to withdraw
     */
    function withdraw(address recipient, uint256 amount) external nonReentrant onlyOwner {
        if (recipient == address(0)) {
            revert PlatformTreasury__InvalidAddress();
        }
        if (amount == 0) {
            revert PlatformTreasury__InvalidAmount();
        }
        if (amount > address(this).balance) {
            revert PlatformTreasury__InsufficientBalance();
        }

        totalFees -= amount;

        (bool success,) = recipient.call{value: amount}("");
        if (!success) {
            revert PlatformTreasury__ETHTransferFailed();
        }

        emit FeeWithdrawn(recipient, amount);
    }



    /**
     * @notice Get total balance in treasury
     * @return Total ETH held
     */
    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }

    /**
     * @notice Get total fees recorded
     * @return Total fees ever deposited
     */
    function getTotalFees() external view returns (uint256) {
        return totalFees;
    }

    /**
     * @notice Get total fees recorded
     * @return Total fees ever deposited
     */
    function getAccruedCreationFee() external view returns (uint256) {
        return accruedCreationFee;
    }

    /**
     * @notice Get total fees recorded
     * @return Total fees ever deposited
     */
    function getAccruedDisputeFee() external view returns (uint256) {
        return accruedDisputeFee;
    }

    /**
     * @notice Receive ETH directly
     */
    receive() external payable {
        totalFees += msg.value;
    }
}
