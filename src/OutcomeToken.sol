// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract OutcomeToken is ERC20 {
    //////////////////////////
    /// State Variables //////
    //////////////////////////
    address public immutable i_market;

    //////////////////////////
    /// Errors //////
    //////////////////////////
    error OutcomeToken__OnlyMarket();

    //////////////////////////
    /// Modifiers //////
    //////////////////////////
    modifier onlyMarket() {
        if (msg.sender != i_market) {
            revert OutcomeToken__OnlyMarket();
        }
        _;
    }

    //////////////////////////
    /// Functions //////
    //////////////////////////
    constructor(string memory _name, string memory _symbol, address _market) ERC20(_name, _symbol) {
        i_market = _market;
    }

    //////////////////////////
    /// External Functions //////
    //////////////////////////
    function mint(address to, uint256 amount) external onlyMarket {
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external onlyMarket {
        _burn(from, amount);
    }
}
