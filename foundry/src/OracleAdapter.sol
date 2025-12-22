// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/**
 * @title OracleAdapter
 * @author Rahul Dindigala
 * @notice Optimistic oracle for resolving prediction market outcomes
 * @dev Implements optimistic oracle pattern with dispute resolution and bond-based security
 */
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
    event OutcomeProposed(
        address indexed market,
        Outcome indexed outcome,
        address indexed proposer,
        uint256 timestamp
    );
    event OutcomeDisputed(
        address indexed market,
        address indexed disputer,
        uint256 indexed timestamp
    );
    event OutcomeFinalized(address indexed market, Outcome indexed finalOutcome);
    event BondRedistributed(
        address indexed market,
        address indexed winner,
        uint256 indexed amount
    );

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

    /**
     * @notice Initialize the OracleAdapter contract
     * @param _proposerBond Required bond amount for proposing outcomes
     * @param _disputeWindow Time window (in seconds) during which outcomes can be disputed
     * @param _disputerBond Required bond amount for disputing outcomes
     * @param _resolutionDeadline Maximum time (in seconds) for resolvers to resolve disputes
     * @param _settlementEngine Address of the SettlementEngine contract
     * @param _owner Address that will own the contract
     */
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

    /**
     * @notice Add or remove a resolver address
     * @dev Resolvers can resolve disputed outcomes
     * @param resolver Address to set resolver status for
     * @param allowed True to grant resolver status, false to revoke
     */
    function setResolver(address resolver, bool allowed) external onlyOwner {
        if (resolver == address(0)) {
            revert OracleAdapter__InvalidAddress();
        }
        resolvers[resolver] = allowed;
    }

    /**
     * @notice Pause oracle operations
     * @dev Prevents new proposals, disputes, and resolutions
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @notice Unpause oracle operations
     * @dev Resumes normal oracle functionality
     */
    function unpause() external onlyOwner {
        _unpause();
    }

    /**
     * @notice Propose an outcome for a market
     * @dev Optimistically assumed correct unless disputed. Requires proposer bond.
     * @param market The market to propose an outcome for
     * @param outcome The outcome to propose (YES or NO)
     * @custom:reverts OracleAdapter__MarketNotClosed If market is not closed or expired
     * @custom:reverts OracleAdapter__OutcomeAlreadyProposed If outcome already proposed
     * @custom:reverts OracleAdapter__InvalidETHAmount If sent ETH doesn't match proposer bond
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
     * @dev Requires posting disputer bond. Must be called within dispute window.
     * @param market The market outcome to dispute
     * @custom:reverts OracleAdapter__OutcomeNotProposed If no outcome has been proposed
     * @custom:reverts OracleAdapter__AlreadyDisputed If outcome is already disputed
     * @custom:reverts OracleAdapter__DisputeWindowClosed If dispute window has passed
     * @custom:reverts OracleAdapter__InvalidETHAmount If sent ETH doesn't match disputer bond
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
     * @notice Resolve a disputed outcome
     * @dev Callable by resolvers only. Must resolve within deadline. Bonds go to winner.
     * @param market The market outcome to resolve
     * @param finalOutcome The final resolved outcome (YES or NO)
     * @param isProposerCorrect True if proposer was correct, false if disputer was correct
     * @custom:reverts OracleAdapter__NotDisputed If outcome is not disputed
     * @custom:reverts OracleAdapter__ResolutionDeadlinePassed If resolution deadline has passed
     * @custom:reverts OracleAdapter__InvalidOutcome If finalOutcome is invalid
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

    /**
     * @notice Finalize an undisputed outcome after dispute window closes
     * @dev Only callable by SettlementEngine. Returns proposer bond.
     * @param market The market to finalize
     * @custom:reverts OracleAdapter__OutcomeNotProposed If no outcome proposed
     * @custom:reverts OracleAdapter__Disputed If outcome was disputed
     * @custom:reverts OracleAdapter__DisputeWindowNotClosed If dispute window hasn't closed
     */
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
    /**
     * @notice Check if an outcome has been finalized for a market
     * @param market The market to check
     * @return bool True if outcome is finalized
     */
    function isFinalized(address market) external view returns (bool) {
        return requests[market].finalized;
    }

    /**
     * @notice Get the finalized outcome for a market
     * @param market The market to query
     * @return Outcome The finalized outcome (YES or NO)
     * @custom:reverts OracleAdapter__OutcomeNotFinalized If outcome is not finalized
     */
    function getFinalOutcome(address market) external view returns (Outcome) {
        if (!requests[market].finalized) {
            revert OracleAdapter__OutcomeNotFinalized();
        }
        return requests[market].proposedOutcome;
    }
}
