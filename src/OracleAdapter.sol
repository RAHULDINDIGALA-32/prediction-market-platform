// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

import {Outcome, MarketState} from "./MarketTypes.sol";
import {Market} from "./Market.sol";

contract OracleAdapter is ReentrancyGuard, Ownable2Step, Pausable {
    //////////////////////////
    /// TYPE DECLARATIONS //////
    //////////////////////////
    struct OracleRequest {
        Outcome proposedOutcome;
        address proposer;
        uint256 proposedAt;
        address disputer;
        bool disputed;
        bool finalized;
    }

    //////////////////////////
    /// STATE VARIABLES //////
    //////////////////////////
    uint256 public immutable i_disputeWindow;
    uint256 public immutable i_disputerBond;
    uint256 public immutable i_proposerBond;
    uint256 public immutable i_resolutionDeadline;
    address public immutable i_settlementEngine;

    mapping(address market => OracleRequest proposalRequest) public requests;
    mapping(address user => bool isResolver) public resolvers;

    //////////////////////////
    /// EVENTS //////
    //////////////////////////
    event OutcomeProposed(address indexed market, Outcome outcome, address proposer, uint256 timestamp);
    event OutcomeDisputed(address indexed market, address indexed disputer, uint256 timestamp);
    event OutcomeFinalized(address indexed market, Outcome finalOutcome);
    event BondRedistributed(address indexed market, address winner, uint256 amount);

    //////////////////////////
    /// ERRORS //////
    //////////////////////////
    error OracleAdapter__OutcomeAlreadyProposed();
    error OracleAdapter__OutcomeNotProposed();
    error OracleAdapter__NotAuthorized();
    error OracleAdapter__NotDisputed();
    error OracleAdapter__Disputed();
    error OracleAdapter__AlreadyDisputed();
    error OracleAdapter__DisputeWindowClosed();
    error OracleAdapter__DisputeWindowNotClosed();
    error OracleAdapter__OutcomeAlreadyFinalized();
    error OracleAdapter__OutcomeAlreadyResolved();
    error OracleAdapter__OutcomeNotFinalized();
    error OracleAdapter__InvalidETHAmount();
    error OracleAdapter__ETHTransferFailed();
    error OracleAdapter__MarketNotClosed();
    error OracleAdapter__ResolutionDeadlinePassed();
    error OracleAdapter__InvalidAddress();
    error OracleAdapter__InvalidOutcome();

    //////////////////////////
    /// MODIFIERS //////
    //////////////////////////
    modifier onlyResolvers() {
        if (!resolvers[msg.sender]) {
            revert OracleAdapter__NotAuthorized();
        }
        _;
    }

    modifier onlySettlementEngine() {
        if (msg.sender != i_settlementEngine) {
            revert OracleAdapter__NotAuthorized();
        }
        _;
    }

    //////////////////////////
    /// FUNCTIONS //////
    //////////////////////////

    constructor(
        uint256 _proposerBond,
        uint256 _disputeWindow,
        uint256 _disputerBond,
        uint256 _resolutionDeadline,
        address _settlementEngine,
        address _owner
    ) {
        if (_settlementEngine == address(0) || _owner == address(0)) {
            revert OracleAdapter__InvalidAddress();
        }
        i_proposerBond = _proposerBond;
        i_disputeWindow = _disputeWindow;
        i_disputerBond = _disputerBond;
        i_resolutionDeadline = _resolutionDeadline;
        i_settlementEngine = _settlementEngine;

        _transferOwnership(_owner);
    }

    //////////////////////////
    /// External Functions ///
    //////////////////////////

    function setResolver(address resolver, bool allowed) external onlyOwner {
        if (resolver == address(0)) {
            revert OracleAdapter__InvalidAddress();
        }
        resolvers[resolver] = allowed;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /**
     * @notice Propose an outcome for a market
     * @dev Optimistically assumed correct unless disputed
     * @param market The market to propose an outcome for
     * @param outcome The outcome to propose
     */
    function proposeOutcome(address market, Outcome outcome) external payable nonReentrant whenNotPaused {
        Market marketContract = Market(market);
        // Allow proposals if market is closed OR expired (even if not explicitly closed)
        if (!marketContract.isClosedOrExpired()) {
            revert OracleAdapter__MarketNotClosed();
        }
        // Validate outcome is valid (YES or NO)
        if (outcome != Outcome.YES && outcome != Outcome.NO) {
            revert OracleAdapter__InvalidOutcome();
        }

        OracleRequest storage request = requests[market];

        if (request.proposedAt != 0) {
            revert OracleAdapter__OutcomeAlreadyProposed();
        }

        if (msg.value != i_proposerBond) {
            revert OracleAdapter__InvalidETHAmount();
        }

        request.proposedOutcome = outcome;
        request.proposer = msg.sender;
        request.proposedAt = block.timestamp;

        emit OutcomeProposed(market, outcome, msg.sender, block.timestamp);
    }

    /**
     * @notice Dispute a proposed outcome
     * @dev Requires posting a bond
     * @param market The market outcome to dispute
     */
    function disputeOutcome(address market) external payable nonReentrant whenNotPaused {
        OracleRequest storage request = requests[market];

        if (request.proposedAt == 0) {
            revert OracleAdapter__OutcomeNotProposed();
        }
        if (request.disputed) {
            revert OracleAdapter__AlreadyDisputed();
        }
        if (block.timestamp > request.proposedAt + i_disputeWindow) {
            revert OracleAdapter__DisputeWindowClosed();
        }
        if (msg.value != i_disputerBond) {
            revert OracleAdapter__InvalidETHAmount();
        }

        request.disputed = true;
        request.disputer = msg.sender;

        emit OutcomeDisputed(market, msg.sender, block.timestamp);
    }

    /**
     * @notice Finalize outcome after dispute window
     * @dev Callable by resolvers only, must resolve within deadline
     * @param market The market outcome to resolve
     * @param finalOutcome The final resolved outcome
     * @param isProposerCorrect whether proposer proposed outcome is correct or not
     */
    function resolveOutcome(address market, Outcome finalOutcome, bool isProposerCorrect)
        external
        nonReentrant
        onlyResolvers
        whenNotPaused
    {
        OracleRequest storage request = requests[market];
        if (!request.disputed) {
            revert OracleAdapter__NotDisputed();
        }
        if (request.finalized) {
            revert OracleAdapter__OutcomeAlreadyResolved();
        }
        if (block.timestamp > request.proposedAt + i_disputeWindow + i_resolutionDeadline) {
            revert OracleAdapter__ResolutionDeadlinePassed();
        }
        // Validate outcome is valid (YES or NO)
        if (finalOutcome != Outcome.YES && finalOutcome != Outcome.NO) {
            revert OracleAdapter__InvalidOutcome();
        }

        request.proposedOutcome = finalOutcome;
        request.finalized = true;

        address winner = isProposerCorrect ? request.proposer : request.disputer;
        uint256 reward = i_proposerBond + i_disputerBond;

        (bool success,) = winner.call{value: reward}("");
        if (!success) {
            revert OracleAdapter__ETHTransferFailed();
        }

        emit BondRedistributed(market, winner, reward);
        emit OutcomeFinalized(market, finalOutcome);
    }

    function finalize(address market) external nonReentrant onlySettlementEngine whenNotPaused {
        OracleRequest storage request = requests[market];
        if (request.proposedAt == 0) {
            revert OracleAdapter__OutcomeNotProposed();
        }
        if (request.finalized) {
            revert OracleAdapter__OutcomeAlreadyFinalized();
        }
        if (request.disputed) {
            revert OracleAdapter__Disputed();
        }
        if (block.timestamp < request.proposedAt + i_disputeWindow) {
            revert OracleAdapter__DisputeWindowNotClosed();
        }

        request.finalized = true;

        (bool success,) = (request.proposer).call{value: i_proposerBond}("");
        if (!success) {
            revert OracleAdapter__ETHTransferFailed();
        }

        emit OutcomeFinalized(market, request.proposedOutcome);
    }

    //////////////////////////
    /// View Functions ///
    //////////////////////////
    function isFinalized(address market) external view returns (bool) {
        return requests[market].finalized;
    }

    function getFinalOutcome(address market) external view returns (Outcome) {
        if (!requests[market].finalized) {
            revert OracleAdapter__OutcomeNotFinalized();
        }
        return requests[market].proposedOutcome;
    }
}
