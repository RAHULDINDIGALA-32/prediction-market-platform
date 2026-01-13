// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/**
 * @title OracleBudget
 * @author Rahul Dindigala
 * @notice Escrow contract for oracle bounty funding
 * @dev Manages per-market bounty allocation and payment
 * Guarantees oracle has funds to pay bounties
 */
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract OracleBudget is ReentrancyGuard, Ownable {
    //////////////////////////
    /// STATE VARIABLES ///
    //////////////////////////
    address public immutable i_oracle;

    mapping(address market => uint256 bounty) public marketBounties;
    mapping(address market => bool claimed) public bountysClaimed;

    uint256 public totalBounty;

    //////////////////////////
    /// EVENTS ///
    //////////////////////////
    event BountyFunded(address indexed market, uint256 indexed amount);
    event BountyPaid(address indexed market, address indexed recipient, uint256 indexed amount);

    //////////////////////////
    /// ERRORS ///
    //////////////////////////
    error OracleBudget__InvalidAddress();
    error OracleBudget__InvalidAmount();
    error OracleBudget__InsufficientBudget();
    error OracleBudget__BountyAlreadyClaimed();
    error OracleBudget__Unauthorized();
    error OracleBudget__ETHTransferFailed();

    //////////////////////////
    /// MODIFIERS ///
    //////////////////////////
    modifier onlyOracle() {
        if (msg.sender != i_oracle) {
            revert OracleBudget__Unauthorized();
        }
        _;
    }

    //////////////////////////
    /// FUNCTIONS ///
    //////////////////////////

    /**
     * @notice Initialize OracleBudget contract
     * @param _oracle Address of OracleAdapter that will claim bounties
     * @param _owner Address of contract owner
     */
    constructor(address _oracle, address _owner) Ownable(_owner) {
        if (_oracle == address(0) || _owner == address(0)) {
            revert OracleBudget__InvalidAddress();
        }
        i_oracle = _oracle;
    }

    /**
     * @notice Fund bounty for a specific market
     * @dev Called by market creator at market creation time
     * @param market The market address
     * @param amount The bounty amount (0.02 ETH usually)
     */
    function fundMarketBounty(address market, uint256 amount) external payable nonReentrant {
        if (market == address(0)) {
            revert OracleBudget__InvalidAddress();
        }
        if (amount == 0) {
            revert OracleBudget__InvalidAmount();
        }
        if (msg.value != amount) {
            revert OracleBudget__InvalidAmount();
        }

        marketBounties[market] = amount;
        totalBounty += amount;

        emit BountyFunded(market, amount);
    }

    /**
     * @notice Pay bounty for finalized outcome (undisputed case: outcome proposer; disputed & proposer correct: proposer; disputed & disputer correct: platform treasury) 
     * @dev Only callable by OracleAdapter
     * Called when outcome is finalized without dispute
     * @param market The market address
     * @param recipient The recipient receiving the bounty
     * @param amount The bounty amount to pay
     */
    function payBounty(address market, address recipient, uint256 amount)
        external
        nonReentrant
        onlyOracle
    {
        if (recipient == address(0)) {
            revert OracleBudget__InvalidAddress();
        }
        if (marketBounties[market] == 0) {
            revert OracleBudget__InsufficientBudget();
        }
        if (bountysClaimed[market]) {
            revert OracleBudget__BountyAlreadyClaimed();
        }
        if (amount > marketBounties[market]) {
            revert OracleBudget__InsufficientBudget();
        }

        bountysClaimed[market] = true;
        totalBounty -= amount;

        // Pay recipient
        (bool success,) = recipient.call{value: amount}("");
        if (!success) {
            revert OracleBudget__ETHTransferFailed();
        }

        emit BountyPaid(market, recipient, amount);
    }

    /**
     * @notice Check if market has funded bounty
     * @param market The market address
     * @return True if bounty is allocated
     */
    function hasBounty(address market) external view returns (bool) {
        return marketBounties[market] > 0;
    }

    /**
     * @notice Get bounty amount for market
     * @param market The market address
     * @return Bounty amount in wei
     */
    function getBounty(address market) external view returns (uint256) {
        return marketBounties[market];
    }

    /**
     * @notice Check if bounty already claimed
     * @param market The market address
     * @return True if bounty has been paid
     */
    function isBountyClaimed(address market) external view returns (bool) {
        return bountysClaimed[market];
    }

    /**
     * @notice Get contract balance
     * @return Total ETH held for bounties
     */
    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }

    /**
     * @notice Receive ETH
     */
    receive() external payable {}
}
