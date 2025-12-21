// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract OracleAdapter is ReentrancyGuard {
    //////////////////////////
    /// TYPE DECLARATIONS //////
    //////////////////////////
    struct OracleRequest {
        bytes32 proposedOutcome;
        uint256 proposalTime;
        bool disputed;
        bool resolved;
    }

    //////////////////////////
    /// STATE VARIABLES //////
    //////////////////////////
    uint256 public immutable i_disputeWindow;
    uint256 public immutable i_disputeBond;

    address public immutable i_settlementEngine;

    mapping(address proposer => OracleRequest proposalRequest) public requests;

    //////////////////////////
    /// EVENTS //////
    //////////////////////////
    event OutcomeProposed(address indexed market, bytes32 indexed outcome, uint256 timestamp);
    event OutcomeDisputed(address indexed market, address indexed disputer, uint256 timestamp);
    event OutcomeResolved(address indexed market, bytes32 indexed finalOutcome);

    //////////////////////////
    /// ERRORS //////
    //////////////////////////
    error OracleAdapter__OutcomeAlreadyProposed();
    error OracleAdapter__OutcomeNotProposed();
    error OracleAdapter__NotAuthorized();
    error OracleAdapter__NotDisputed();
    error OracleAdapter__AlreadyDisputed();
    error OracleAdapter__DisputeWindowClosed();
    error OracleAdapter__OutcomeAlreadyResolved();
    error OracleAdapter__InvalidOutcome();
    error OracleAdapter__InvalidETHAmount();

    //////////////////////////
    /// MODIFIERS //////
    //////////////////////////
    modifier onlySettlementEngine() {
        if (msg.sender != i_settlementEngine) {
            revert OracleAdapter__NotAuthorized();
        }
        _;
    }

    //////////////////////////
    /// FUNCTIONS //////
    //////////////////////////

    constructor(address _settlementEngine, uint256 _disputeWindow, uint256 _disputeBond) {
        i_settlementEngine = _settlementEngine;
        i_disputeWindow = _disputeWindow;
        i_disputeBond = _disputeBond;
    }

    //////////////////////////
    /// External Functions ///
    //////////////////////////
    /**
     * @notice Propose an outcome for a market
     * @dev Optimistically assumed correct unless disputed
     * @param market The market to propose an outcome for
     * @param outcome The outcome to propose
     */
    function proposeOutcome(address market, bytes32 outcome) external {
        OracleRequest storage request = requests[market];

        if (request.proposalTime != 0) {
            revert OracleAdapter__OutcomeAlreadyProposed();
        }
        if (outcome == bytes32(0)) {
            revert OracleAdapter__InvalidOutcome();
        }

        request.proposedOutcome = outcome;
        request.proposalTime = block.timestamp;

        emit OutcomeProposed(market, outcome, block.timestamp);
    }

    /**
     * @notice Dispute a proposed outcome
     * @dev Requires posting a bond
     * @param market The market outcome to dispute
     */
    function disputeOutcome(address market) external payable nonReentrant {
        OracleRequest storage request = requests[market];

        if (request.proposalTime == 0) {
            revert OracleAdapter__OutcomeNotProposed();
        }
        if (request.disputed) {
            revert OracleAdapter__AlreadyDisputed();
        }
        if (block.timestamp > request.proposalTime + i_disputeWindow) {
            revert OracleAdapter__DisputeWindowClosed();
        }
        if (msg.value != i_disputeBond) {
            revert OracleAdapter__InvalidETHAmount();
        }

        request.disputed = true;

        emit OutcomeDisputed(market, msg.sender, block.timestamp);

        // more to extend (UMA):
        // → escalate to DVM / governance
        // → here we stop at "disputed"

        //  Final dispute arbitration (UMA DVM / governance)
        // Bond redistribution logic
        // Multiple outcome types
        // Oracle whitelisting
    }

    /**
     * @notice Finalize outcome after dispute window
     * @dev Callable by SettlementEngine only
     * @param market The market outcome to resolve
     * @param outcome The final resolved outcome
     */
    function resolveOutcome(address market, bytes32 outcome) external onlySettlementEngine {
        OracleRequest storage request = requests[market];
        if (!request.disputed) {
            revert OracleAdapter__NotDisputed();
        }
        if (request.resolved) {
            revert OracleAdapter__OutcomeAlreadyResolved();
        }
        if (outcome == bytes32(0)) {
            revert OracleAdapter__InvalidOutcome();
        }

        request.proposedOutcome = outcome;
        request.resolved = true;

        emit OutcomeResolved(market, outcome);
    }

    //////////////////////////
    /// View Functions ///
    //////////////////////////
    function getOutcome(address market) external view returns (bytes32) {
        return requests[market].proposedOutcome;
    }

    function isDisputed(address market) external view returns (bool) {
        return requests[market].disputed;
    }

    function isResolved(address market) external view returns (bool) {
        return requests[market].resolved;
    }
}
