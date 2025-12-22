// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {OutcomeToken} from "./OutcomeToken.sol";
import {Vault} from "./Vault.sol";
import {OracleAdapter} from "./OracleAdapter.sol";
import {Outcome} from "./MarketTypes.sol";
import {Market} from "./Market.sol";

contract SettlementEngine is ReentrancyGuard {
    //////////////////////////
    /// STATE VARIABLES ///
    //////////////////////////
    OracleAdapter public immutable i_oracle;
    Vault public immutable i_vault;

    mapping(address market => bool isSettled) public marketSettled;
    mapping(address market => mapping(address user => bool isredeemed)) public redeemed;

    //////////////////////////
    /// EVENTS ///
    //////////////////////////
    event MarketSettled(address indexed market, Outcome outcome);
    event Redeemed(address indexed market, address indexed user, uint256 winningTokenAmount, uint256 ethPaid);

    //////////////////////////
    /// ERRORS ///
    //////////////////////////
    error SettlementEngine__MarketAlreadySettled();
    error SettlementEngine__MarketNotSettled();
    error SettlementEngine__MarketNotResolved();
    error SettlementEngine__MarketNotExpired();
    error SettlementEngine__TokensAlreadyRedeemed();
    error SettlementEngine__InsufficientVaultBalance();
    error SettlementEngine__ZeroBalance();

    //////////////////////////
    /// FUNCTIONS ///
    //////////////////////////

    constructor(address _oracle, address _vault) {
        i_oracle = OracleAdapter(_oracle);
        i_vault = Vault(_vault);
    }

    /**
     * @notice Finalize a market after oracle resolution
     * @param market The market to settle
     */
    function settleMarket(address market) external {
        if (marketSettled[market]) {
            revert SettlementEngine__MarketAlreadySettled();
        }
        if (block.timestamp < Market(market).i_endTime()) {
            revert SettlementEngine__MarketNotExpired();
        }
        if (!i_oracle.isFinalized(market)) {
            revert SettlementEngine__MarketNotResolved();
        }

        Outcome outcome = i_oracle.getFinalOutcome(market);

        marketSettled[market] = true;
        emit MarketSettled(market, outcome);
    }

    function redeem(address market) external nonReentrant {
        if (!marketSettled[market]) {
            revert SettlementEngine__MarketNotSettled();
        }
        if (redeemed[market][msg.sender]) {
            revert SettlementEngine__TokensAlreadyRedeemed();
        }

        Outcome outcome = i_oracle.getFinalOutcome(market);
        address winningToken = Market(market).winningToken(outcome);
        uint256 payoutRate = Market(market).payoutRate();

        OutcomeToken token = OutcomeToken(winningToken);
        uint256 userBalance = token.balanceOf(msg.sender);

        if (userBalance == 0) {
            revert SettlementEngine__ZeroBalance();
        }

        uint256 ethToPay = userBalance * payoutRate;
        if (i_vault.balanceOf(market) < ethToPay) {
            revert SettlementEngine__InsufficientVaultBalance();
        }

        redeemed[market][msg.sender] = true;

        token.burn(msg.sender, userBalance);
        i_vault.withdraw(market, msg.sender, ethToPay);

        emit Redeemed(market, msg.sender, userBalance, ethToPay);
    }
}
