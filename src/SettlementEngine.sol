// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

//////////////////////////
/// INTERFACES ///
//////////////////////////
interface IOracleAdapter {
    function isResolved(address market) external view returns (bool);
    function getOutcome(address market) external view returns (bytes32);
}

interface IVault {
    function withdraw(address market, address recipient, uint256 amount) external;
    function balanceOf(address market) external view returns (uint256);
}

interface IERC20Burnable {
    function balanceOf(address user) external view returns (uint256);
    function burn(address from, uint256 amount) external;
}

interface IMarket {
    function winningToken(bytes32 outcome) external view returns (address);
    function payoutPerToken() external view returns (uint256);
}

contract SettlementEngine is ReentrancyGuard {
    //////////////////////////
    /// STATE VARIABLES ///
    //////////////////////////
    IOracleAdapter public immutable i_oracle;
    IVault public immutable i_vault;

    mapping(address market => bool isSettled) public marketSettled;
    mapping(address market => mapping(address user => bool isredeemed)) public redeemed;

    //////////////////////////
    /// EVENTS ///
    //////////////////////////
    event MarketSettled(address indexed market, bytes32 outcome);
    event Redeemed(address indexed market, address indexed user, uint256 yesTokenAmount, uint256 ethPaid);

    //////////////////////////
    /// ERRORS ///
    //////////////////////////
    error SettlementEngine__MarketAlreadySettled();
    error SettlementEngine__MarketNotSettled();
    error SettlementEngine__MarketNotResolved();
    error SettlementEngine__TokensAlreadyRedeemed();
    error SettlementEngine__InsufficientVaultBalance();
    error SettlementEngine__ZeroBalance();

    //////////////////////////
    /// FUNCTIONS ///
    //////////////////////////

    constructor(address _oracle, address _vault) {
        i_oracle = IOracleAdapter(_oracle);
        i_vault = IVault(_vault);
    }

    /**
     * @notice Finalize a market after oracle resolution
     * @param market The market to settle
     */
    function settleMarket(address market) external {
        if (marketSettled[market]) {
            revert SettlementEngine__MarketAlreadySettled();
        }
        if (!i_oracle.isResolved(market)) {
            revert SettlementEngine__MarketNotResolved();
        }

        bytes32 outcome = i_oracle.getOutcome(market);

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

        bytes32 outcome = i_oracle.getOutcome(market);
        address winningToken = IMarket(market).winningToken(outcome);
        uint256 payoutRate = IMarket(market).payoutPerToken();

        IERC20Burnable token = IERC20Burnable(winningToken);
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
