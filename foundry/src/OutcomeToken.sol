// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/**
 * @title OutcomeToken
 * @author Rahul Dindigala
 * @notice ERC20 token representing a single outcome in a prediction market
 * @dev Minted by Market contract, burned by SettlementEngine during redemption
 */
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract OutcomeToken is ERC20 {
    //////////////////////////
    /// State Variables //////
    //////////////////////////
    address public immutable i_market;
    address public immutable i_settlementEngine;

    //////////////////////////
    /// Errors //////
    //////////////////////////
    error OutcomeToken__OnlyMarket();
    error OutcomeToken__OnlySettlementEngine();
    error OutcomeToken__InvalidAddress();

    //////////////////////////
    /// Modifiers //////
    //////////////////////////
    modifier onlyMarket() {
        if (msg.sender != i_market) {
            revert OutcomeToken__OnlyMarket();
        }
        _;
    }

    modifier onlySettlementEngine() {
        if (msg.sender != i_settlementEngine) {
            revert OutcomeToken__OnlySettlementEngine();
        }
        _;
    }

    //////////////////////////
    /// Functions //////
    //////////////////////////
    /**
     * @notice Initialize an outcome token
     * @param _name Token name (e.g., "Yes Token")
     * @param _symbol Token symbol (e.g., "YES")
     * @param _market Address of the Market contract that can mint tokens
     * @param _settlementEngine Address of the SettlementEngine that can burn tokens
     */
    constructor(string memory _name, string memory _symbol, address _market, address _settlementEngine)
        ERC20(_name, _symbol)
    {
        if (_market == address(0) || _settlementEngine == address(0)) {
            revert OutcomeToken__InvalidAddress();
        }
        i_market = _market;
        i_settlementEngine = _settlementEngine;
    }

    //////////////////////////
    /// External Functions //////
    //////////////////////////
    /**
     * @notice Mint outcome tokens to a user
     * @dev Only callable by the Market contract during trades
     * @param to Address to mint tokens to
     * @param amount Amount of tokens to mint
     */
    function mint(address to, uint256 amount) external onlyMarket {
        _mint(to, amount);
    }

    /**
     * @notice Burn outcome tokens from a user
     * @dev Only callable by SettlementEngine during redemption
     * @param from Address to burn tokens from
     * @param amount Amount of tokens to burn
     */
    function burn(address from, uint256 amount) external onlySettlementEngine {
        _burn(from, amount);
    }

    /**
     * @notice Burn outcome tokens from a user on sell trades
     * @dev Only callable by the Market contract when a user sells outcome tokens
     */
    function burnFromUser(address from, uint256 amount) external onlyMarket {
        _burn(from, amount);
    }
}
