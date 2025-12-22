// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

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
    function mint(address to, uint256 amount) external onlyMarket {
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external onlySettlementEngine {
        _burn(from, amount);
    }
}
