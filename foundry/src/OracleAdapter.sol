// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/**
 * @title OracleAdapter
 * @author Rahul Dindigala
 * @notice Optimistic oracle for resolving prediction market outcomes
 * @dev Implements optimistic oracle pattern with dispute resolution and bond-based security
 */
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Outcome, MarketState} from "./MarketTypes.sol";
import {Market} from "./Market.sol";
import {OracleBudget} from "./OracleBudget.sol";
import {PlatformTreasury} from "./PlatformTreasury.sol";

contract OracleAdapter is ReentrancyGuard, Ownable {
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
    uint256 public constant PROPOSER_BOUNTY = 0.02 ether;
    uint256 public constant RESOLUTION_FEE_PERCENTAGE = 5000; // Dispute Resolution fee (% share in Loser Bond) (5000 = 50%)
    uint256 public constant RESOLVER_BOUNTY_PERCENTAGE = 5000; // Resolver bounty (% share in Resolution Fee) (5000 = 50%)

    uint256 public immutable i_disputeWindow;
    uint256 public immutable i_disputerBond;
    uint256 public immutable i_proposerBond;
    uint256 public immutable i_resolutionDeadline;
    address public immutable i_settlementEngine;
    OracleBudget public immutable i_oracleBudget;
    PlatformTreasury public immutable i_platformTreasury;

    mapping(address market => OracleRequest proposalRequest) public requests;
    mapping(address user => bool isResolver) public resolvers;

    //////////////////////////
    /// EVENTS //////
    //////////////////////////
    event OutcomeProposed(address indexed market, Outcome indexed outcome, address indexed proposer, uint256 timestamp);
    event OutcomeDisputed(address indexed market, address indexed disputer, uint256 indexed timestamp);
    event OutcomeFinalized(address indexed market, Outcome indexed finalOutcome);
    event BondRedistributed(address indexed market, address indexed winner, uint256 indexed amount);
    event BountyPaid(address indexed market, address indexed proposer, uint256 indexed bounty);
    event PlatformFeePaid(uint256 indexed amount);

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
    error OracleAdapter__InvalidBasisPoints();

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
     * @param _proposerBond Required bond amount for proposing outcomes (e.g., 0.01 ETH)
     * @param _disputeWindow Time window (in seconds) during which outcomes can be disputed
     * @param _disputerBond Required bond amount for disputing outcomes (e.g., 0.02 ETH)
     * @param _resolutionDeadline Maximum time (in seconds) for resolvers to resolve disputes
     * @param _settlementEngine Address of the SettlementEngine contract
     * @param _oracleBudget Address of the OracleBudget contract (bounty fund)
     * @param _platformTreasury Address of the PlatformTreasury contract (fee recipient)
     * @param _owner Address that will own the contract
     */
    constructor(
        uint256 _proposerBond,
        uint256 _disputeWindow,
        uint256 _disputerBond,
        uint256 _resolutionDeadline,
        address _settlementEngine,
        address payable _oracleBudget,
        address payable _platformTreasury,
        address _owner
    ) Ownable(_owner) {
        if (
            _settlementEngine == address(0) || _oracleBudget == address(0) || _platformTreasury == address(0)
                || _owner == address(0)
        ) {
            revert OracleAdapter__InvalidAddress();
        }

        i_proposerBond = _proposerBond;
        i_disputeWindow = _disputeWindow;
        i_disputerBond = _disputerBond;
        i_resolutionDeadline = _resolutionDeadline;
        i_settlementEngine = _settlementEngine;
        i_oracleBudget = OracleBudget(_oracleBudget);
        i_platformTreasury = PlatformTreasury(_platformTreasury);
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
     * @notice Propose an outcome for a market
     * @dev Optimistically assumed correct unless disputed. Requires proposer bond.
     * @param market The market to propose an outcome for
     * @param outcome The outcome to propose (YES or NO)
     * @custom:reverts OracleAdapter__MarketNotClosed If market is not closed or expired
     * @custom:reverts OracleAdapter__OutcomeAlreadyProposed If outcome already proposed
     * @custom:reverts OracleAdapter__InvalidETHAmount If sent ETH doesn't match proposer bond
     */
    function proposeOutcome(address market, Outcome outcome) external payable nonReentrant {
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
    function disputeOutcome(address market) external payable nonReentrant {
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
     * @dev Callable by resolvers only. Distributes bonds with platform fee.
     *      Platform fee = (1 - isProposerCorrect ? proposerBond : disputerBond) * resolutionFeePercentage
     *      This ensures platform is paid from the loser's bond.
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

        address winner;
        uint256 loserBond;

        if (isProposerCorrect) {
            // Proposer was correct
            winner = request.proposer;
            loserBond = i_disputerBond;

            // Proposer gets: bond back + bounty + (1 - fee) * disputer bond
            uint256 resolutionFee = (loserBond * RESOLUTION_FEE_PERCENTAGE) / 10000;
            uint256 winnerShare = loserBond - resolutionFee;
            uint256 proposerTotal = i_proposerBond + winnerShare;
            uint256 resolverShare = (resolutionFee * RESOLVER_BOUNTY_PERCENTAGE) / 10000;
            uint256 platformFee = resolutionFee - resolverShare;

            (bool winnerSuccess,) = winner.call{value: proposerTotal}("");
            if (!winnerSuccess) {
                revert OracleAdapter__ETHTransferFailed();
            }

            // Pull bounty from OracleBudget (disputed but proposer was correct)
            i_oracleBudget.payBounty(market, request.proposer, PROPOSER_BOUNTY);

            (bool resolverSuccess,) = msg.sender.call{value: resolverShare}("");
            if (!resolverSuccess) {
                revert OracleAdapter__ETHTransferFailed();
            }

            i_platformTreasury.depositDisputeFee{value: platformFee}(market);

            emit BondRedistributed(market, winner, proposerTotal);
            emit PlatformFeePaid(platformFee);
        } else {
            // Disputer was correct
            winner = request.disputer;
            loserBond = i_proposerBond;

            // Disputer gets: bond back + (1 - fee) * proposer bond
            uint256 resolutionFee = (loserBond * RESOLUTION_FEE_PERCENTAGE) / 10000;
            uint256 winnerShare = loserBond - resolutionFee;
            uint256 disputerTotal = i_disputerBond + winnerShare;
            uint256 resolverShare = (resolutionFee * RESOLVER_BOUNTY_PERCENTAGE) / 10000;
            uint256 platformFee = resolutionFee - resolverShare;

            (bool winnerSuccess,) = winner.call{value: disputerTotal}("");
            if (!winnerSuccess) {
                revert OracleAdapter__ETHTransferFailed();
            }

            (bool resolverSuccess,) = msg.sender.call{value: resolverShare}("");
            if (!resolverSuccess) {
                revert OracleAdapter__ETHTransferFailed();
            }

            i_platformTreasury.depositDisputeFee{value: platformFee}(market);
            // Pull bounty from OracleBudget (disputed but disputer was correct)
            i_oracleBudget.payBounty(market, address(i_platformTreasury), PROPOSER_BOUNTY);

            emit BondRedistributed(market, winner, disputerTotal);
            emit PlatformFeePaid(platformFee);
        }

        emit OutcomeFinalized(market, finalOutcome);
    }

    /**
     * @notice Finalize an undisputed outcome after dispute window closes
     * @dev Only callable by SettlementEngine. Pulls bounty from OracleBudget.
     *      Fixed bounty incentivizes fast, truthful oracle proposals.
     * @param market The market to finalize
     * @custom:reverts OracleAdapter__OutcomeNotProposed If no outcome proposed
     * @custom:reverts OracleAdapter__Disputed If outcome was disputed
     * @custom:reverts OracleAdapter__DisputeWindowNotClosed If dispute window hasn't closed
     */
    function finalize(address market) external nonReentrant onlySettlementEngine {
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

        // Return proposer bond + pay fixed bounty from OracleBudget
        (bool bondSuccess,) = (request.proposer).call{value: i_proposerBond}("");
        if (!bondSuccess) {
            revert OracleAdapter__ETHTransferFailed();
        }

        // Pull bounty from OracleBudget (undisputed case)
        i_oracleBudget.payBounty(market, request.proposer, PROPOSER_BOUNTY);

        emit BountyPaid(market, request.proposer, PROPOSER_BOUNTY);
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

    /**
     * @notice Get the proposal timestamp for a market
     * @dev Used by SettlementEngine to determine if dispute window is closed
     * @param market The market address
     * @return uint256 Timestamp when outcome was proposed (0 if not proposed)
     */
    function getProposalTime(address market) external view returns (uint256) {
        return requests[market].proposedAt;
    }

    /**
     * @notice Check if an outcome has been disputed
     * @dev Used by SettlementEngine to determine if outcome can be auto-finalized
     * @param market The market address
     * @return bool True if outcome is currently disputed
     */
    function isDisputed(address market) external view returns (bool) {
        return requests[market].disputed;
    }

    /**
     * @notice Get the dispute window duration
     * @dev Used by SettlementEngine to check if dispute window has closed
     * @return uint256 Dispute window duration in seconds
     */
    function getDisputeWindow() external view returns (uint256) {
        return i_disputeWindow;
    }
}
