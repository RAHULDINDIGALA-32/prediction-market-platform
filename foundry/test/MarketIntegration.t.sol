// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.17;

import {Test} from "forge-std/Test.sol";
import {Market} from "../src/Market.sol";
import {QuoteVerifier} from "../src/QuoteVerifier.sol";
import {Vault} from "../src/Vault.sol";
import {OutcomeToken} from "../src/OutcomeToken.sol";
import {MarketState, Outcome, TradeQuote} from "../src/MarketTypes.sol";

contract MarketIntegrationTest is Test {
    Vault vault;
    QuoteVerifier verifier;
    Market market;

    // test signer private key and address
    uint256 signerKey = uint256(0xBEEF);
    address signer;

    // trader private key/address
    uint256 traderKey = uint256(0xCAFE);
    address trader;

    function setUp() public {
        signer = vm.addr(signerKey);
        trader = vm.addr(traderKey);

        // deploy a dummy settlementEngine and factory as addresses
        address settlementEngine = address(0x1234);
        address factory = address(this);

        vault = new Vault(settlementEngine, factory);
        verifier = new QuoteVerifier(address(this));

        // register signer
        verifier.addSigner(signer);

        uint256 endTime = block.timestamp + 1 days;
        market = new Market(address(this), address(vault), address(verifier), settlementEngine, endTime);

        // register market in vault via factory flow: vault.registerMarket expects onlyFactory, so simulate via factory
        // in this test, `this` acted as factory when constructing vault; call registerMarket
        vault.registerMarket(address(market));
    }

    // Helper to compute domain separator per EIP-712
    function domainSeparator(address verifyingContract) internal view returns (bytes32) {
        bytes32 EIP712_DOMAIN_TYPEHASH = keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
        return keccak256(abi.encode(
            EIP712_DOMAIN_TYPEHASH,
            keccak256(bytes("PredictionMarket-QuoteVerifier")),
            keccak256(bytes("1")),
            block.chainid,
            verifyingContract
        ));
    }

    bytes32 constant TRADE_QUOTE_TYPEHASH = keccak256("TradeQuote(address trader,address market,Outcome outcome,uint256 amount,uint256 cost,uint256 deadline,uint256 nonce,bool isSell,uint256 minAmountOut,uint256 minReturn)");

    function structHash(TradeQuote memory q) internal pure returns (bytes32) {
        return keccak256(abi.encode(
            TRADE_QUOTE_TYPEHASH,
            q.trader,
            q.market,
            uint8(q.outcome),
            q.amount,
            q.cost,
            q.deadline,
            q.nonce,
            q.isSell,
            q.minAmountOut,
            q.minReturn
        ));
    }

    function digestFor(TradeQuote memory q, address verifyingContract) internal view returns (bytes32) {
        bytes32 ds = domainSeparator(verifyingContract);
        bytes32 sh = structHash(q);
        return keccak256(abi.encodePacked("\x19\x01", ds, sh));
    }

    function toSignature(uint8 v, bytes32 r, bytes32 s) internal pure returns (bytes memory) {
        return abi.encodePacked(r, s, v);
    }

    function testBuyAndSellFlow() public {
        // create a buy quote
        TradeQuote memory q;
        q.trader = trader;
        q.market = address(market);
        q.outcome = Outcome.YES;
        q.amount = 1 ether;
        q.cost = 1 ether; // simple 1:1 for test
        q.deadline = block.timestamp + 1 hours;
        q.nonce = 1;
        q.isSell = false;
        q.minAmountOut = 1 ether;
        q.minReturn = 0;

        bytes32 d = digestFor(q, address(verifier));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerKey, d);
        bytes memory sig = toSignature(v, r, s);

        // ensure verifier accepts signature
        bytes32 qh = verifier.verifyTradeQuote(q, sig);
        assertTrue(qh != bytes32(0));

        // execute trade as trader
        vm.prank(trader);
        market.executeTrade{value: q.cost}(q, sig, q.minAmountOut, q.minReturn);

        // trader should have YES token balance
        OutcomeToken yes = OutcomeToken(market.winningToken(Outcome.YES));
        uint256 bal = yes.balanceOf(trader);
        assertEq(bal, q.amount);

        // vault balance should equal cost
        uint256 vb = vault.balanceOf(address(market));
        assertEq(vb, q.cost);

        // Now create a sell quote to sell the token back
        TradeQuote memory sellQ = q;
        sellQ.isSell = true;
        sellQ.nonce = 2;
        sellQ.minReturn = 0;
        // refund equals q.cost for this simple test

        bytes32 d2 = digestFor(sellQ, address(verifier));
        (v, r, s) = vm.sign(signerKey, d2);
        bytes memory sig2 = toSignature(v, r, s);

        vm.prank(trader);
        market.executeTrade(sellQ, sig2, sellQ.minAmountOut, sellQ.minReturn);

        // after sell, token balance should be 0
        uint256 balAfter = yes.balanceOf(trader);
        assertEq(balAfter, 0);

        // vault balance should be decreased
        uint256 vbAfter = vault.balanceOf(address(market));
        assertEq(vbAfter, 0);
    }

    function testNonceReplayPrevention() public {
        // create two quotes with same nonce but different amounts to simulate concurrent quotes
        TradeQuote memory q1;
        q1.trader = trader;
        q1.market = address(market);
        q1.outcome = Outcome.NO;
        q1.amount = 1 ether;
        q1.cost = 1 ether;
        q1.deadline = block.timestamp + 1 hours;
        q1.nonce = 10;
        q1.isSell = false;
        q1.minAmountOut = 1 ether;
        q1.minReturn = 0;

        TradeQuote memory q2 = q1;
        q2.amount = 2 ether; // different amount
        q2.cost = 2 ether;

        bytes32 d1 = digestFor(q1, address(verifier));
        (uint8 v1, bytes32 r1, bytes32 s1) = vm.sign(signerKey, d1);
        bytes memory sig1 = toSignature(v1, r1, s1);

        bytes32 d2 = digestFor(q2, address(verifier));
        (uint8 v2, bytes32 r2, bytes32 s2) = vm.sign(signerKey, d2);
        bytes memory sig2 = toSignature(v2, r2, s2);

        // execute first quote
        vm.prank(trader);
        market.executeTrade{value: q1.cost}(q1, sig1, q1.minAmountOut, q1.minReturn);

        // second quote should revert because nonce was updated by the first execute
        vm.prank(trader);
        vm.expectRevert();
        market.executeTrade{value: q2.cost}(q2, sig2, q2.minAmountOut, q2.minReturn);
    }

    function testUnauthorizedSignerRejected() public {
        // Create a quote signed by an unauthorized key
        uint256 badKey = uint256(0xDEAD);
        address badSigner = vm.addr(badKey);

        TradeQuote memory q;
        q.trader = trader;
        q.market = address(market);
        q.outcome = Outcome.YES;
        q.amount = 1 ether;
        q.cost = 1 ether;
        q.deadline = block.timestamp + 1 hours;
        q.nonce = 100;
        q.isSell = false;
        q.minAmountOut = 1 ether;
        q.minReturn = 0;

        bytes32 d = digestFor(q, address(verifier));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(badKey, d);
        bytes memory sig = toSignature(v, r, s);

        vm.expectRevert();
        verifier.verifyTradeQuote(q, sig);
    }
}
