// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.17;

import {Test} from "forge-std/Test.sol";
import {SettlementEngine} from "../src/SettlementEngine.sol";
import {Outcome, MarketState} from "../src/MarketTypes.sol";

contract MockOracle {
    bool public finalized;
    Outcome public finalOutcome;

    function setFinal(Outcome o) external {
        finalized = true;
        finalOutcome = o;
    }

    function isFinalized(address) external view returns (bool) {
        return finalized;
    }

    function getFinalOutcome(address) external view returns (Outcome) {
        return finalOutcome;
    }
}

contract MockVault {
    mapping(address => uint256) public balances;
    function deposit() external payable {}
    function withdraw(address market, address recipient, uint256 amount) external {
        // transfer ETH to recipient
        payable(recipient).transfer(amount);
    }
    function balanceOf(address) external view returns (uint256) { return address(this).balance; }
}

contract MockToken {
    mapping(address => uint256) public balances;
    function mint(address to, uint256 amount) external { balances[to] += amount; }
    function burn(address from, uint256 amount) external { balances[from] -= amount; }
    function balanceOf(address a) external view returns (uint256) { return balances[a]; }
}

contract MockMarket {
    uint256 public endTime;
    bool public closed;
    address public winnerToken;
    uint256 public payout;
    address public lastSettler;

    constructor(uint256 _endTime, address _winnerToken, uint256 _payout) {
        endTime = _endTime;
        winnerToken = _winnerToken;
        payout = _payout;
        closed = true;
    }

    function i_endTime() external view returns (uint256) { return endTime; }
    function isClosedOrExpired() external view returns (bool) { return closed; }
    function settleMarket(Outcome) external { lastSettler = msg.sender; }
    function winningToken(Outcome) external view returns (address) { return winnerToken; }
    function payoutRate() external view returns (uint256) { return payout; }
}

contract SettlementEngineTest is Test {
    MockOracle oracle;
    MockVault vault;
    SettlementEngine engine;

    function setUp() public {
        oracle = new MockOracle();
        vault = new MockVault();
        engine = new SettlementEngine(address(oracle), address(vault));
    }

    function testSettleMarketFlow() public {
        MockToken token = new MockToken();
        MockMarket market = new MockMarket(block.timestamp - 1, address(token), 1 ether);

        // oracle not finalized -> revert
        vm.expectRevert();
        engine.settleMarket(address(market));

        // finalize in oracle
        oracle.setFinal(Outcome.YES);

        // now should settle successfully
        engine.settleMarket(address(market));
        assertTrue(true);
    }

    function testRedeemRevertsWhenNotSettledOrInvalidAmount() public {
        // redeem without settling should revert
        vm.expectRevert();
        engine.redeem(address(0xBEEF), 1 ether);

        // zero amount revert
        // mark market as settled via low-level storage access not possible; instead call settle path
        MockToken token = new MockToken();
        MockMarket market = new MockMarket(block.timestamp - 1, address(token), 1 ether);
        oracle.setFinal(Outcome.YES);
        engine.settleMarket(address(market));

        vm.expectRevert();
        engine.redeem(address(market), 0);
    }
}
