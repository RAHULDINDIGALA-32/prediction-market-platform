// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.17;

import {Test} from "forge-std/Test.sol";
import {MarketFactory} from "../src/MarketFactory.sol";
import {QuoteVerifier} from "../src/QuoteVerifier.sol";

contract MockVault {
    mapping(address => bool) public registered;

    function registerMarket(address market) external {
        registered[market] = true;
    }
}

contract MarketFactoryTest is Test {
    MarketFactory factory;
    MockVault vault;
    QuoteVerifier verifier;

    function setUp() public {
        vault = new MockVault();
        // create a real QuoteVerifier with this test as owner
        verifier = new QuoteVerifier(address(this));
        // other deps can be dummy addresses
        address dummyOracle = address(0x100);
        address dummyOracleBudget = address(0x101);
        address dummyTreasury = address(0x102);
        address dummySettlement = address(0x200);
        address dummyOwner = address(this);

        factory = new MarketFactory(
            address(vault),
            dummyOracle,
            payable(dummyOracleBudget),
            payable(dummyTreasury),
            address(verifier),
            dummySettlement,
            dummyOwner
        );
    }

    function testCreateMarketRegistersVault() public {
        bytes32 meta = keccak256(abi.encodePacked("meta"));
        uint256 endTime = block.timestamp + 1 days;
        uint256 lmsrB = 1 ether;
        uint256 subsidy = (lmsrB * 693) / 1000;

        address created = factory.createMarket{value: 0.03 ether + subsidy}(meta, endTime, lmsrB, subsidy);
        assertTrue(created != address(0));
        // verify vault registered the market
        bool reg = vault.registered(created);
        assertTrue(reg);

        // verify metadata mapping
        bytes32 got = factory.getMarketMetadataHash(created);
        assertEq(got, meta);
    }
}
