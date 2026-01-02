// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.17;

import {Test} from "forge-std/Test.sol";
import {QuoteVerifier} from "../src/QuoteVerifier.sol";
import {TradeQuote, Outcome} from "../src/MarketTypes.sol";

contract QuoteVerifierTest is Test {
    QuoteVerifier verifier;
    uint256 ownerKey = uint256(0xABCD);
    address owner;
    uint256 signerKey = uint256(0xBEEF);
    address signer;

    function setUp() public {
        owner = vm.addr(ownerKey);
        vm.prank(owner);
        verifier = new QuoteVerifier(owner);
        signer = vm.addr(signerKey);
        vm.prank(owner);
        verifier.addSigner(signer);
    }

    function testVerifyAndUpdateNonce() public {
        TradeQuote memory q;
        q.trader = address(0x1);
        q.market = address(0x2);
        q.outcome = Outcome.YES;
        q.amount = 1 ether;
        q.cost = 1 ether;
        q.deadline = block.timestamp + 1 hours;
        q.nonce = 1;
        q.isSell = false;
        q.minAmountOut = 1 ether;
        q.minReturn = 0;

        bytes32 domain = keccak256(abi.encode(keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"), keccak256(bytes("PredictionMarket-QuoteVerifier")), keccak256(bytes("1")), block.chainid, address(verifier)));
        bytes32 structHash = keccak256(abi.encode(keccak256("TradeQuote(address trader,address market,Outcome outcome,uint256 amount,uint256 cost,uint256 deadline,uint256 nonce,bool isSell,uint256 minAmountOut,uint256 minReturn)"), q.trader, q.market, uint8(q.outcome), q.amount, q.cost, q.deadline, q.nonce, q.isSell, q.minAmountOut, q.minReturn));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domain, structHash));

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerKey, digest);
        bytes memory sig = abi.encodePacked(r, s, v);

        // verify returns a hash
        bytes32 qh = verifier.verifyTradeQuote(q, sig);
        assertTrue(qh != bytes32(0));

        // updateNonce must be callable by market only — simulate market
        vm.prank(q.market);
        verifier.updateNonce(q.trader, q.market, q.nonce);

        // calling updateNonce with lower nonce should revert
        vm.prank(q.market);
        vm.expectRevert();
        verifier.updateNonce(q.trader, q.market, q.nonce);
    }
}
