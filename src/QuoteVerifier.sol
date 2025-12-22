// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

import {TradeQuote, Outcome} from "./MarketTypes.sol";

contract QuoteVerifier is EIP712, Ownable2Step {
    using ECDSA for bytes32;

    //////////////////////////
    /// STATE VARIABLES ///
    //////////////////////////
    bytes32 private constant TRADE_QUOTE_TYPEHASH = keccak256(
        "TradeQuote(address trader,address market,Outcome outcome,uint256 amount,uint256 cost,uint256 deadline,uint256 nonce)"
    );

    mapping(address signer => bool allowed) allowedSigners;

    //////////////////////////
    /// EVENTS //////
    //////////////////////////
    event SignerAdded(address signer);
    event SignerRemoved(address signer);

    //////////////////////////
    /// ERRORS //////
    //////////////////////////
    error QuoteVerifier__UnauthorizedSigner();
    error QuoteVerifier__QuoteExpired();
    error QuoteVerifier__InvalidAmount();
    error QuoteVerifier__InvalidMarket();

    //////////////////////////
    /// FUNCTIONS //////
    //////////////////////////

    constructor(address initialOwner) EIP712("PredictionMarket-QuoteVerifier", "1") {
        _transferOwnership(initialOwner);
    }

    //////////////////////////
    /// External Functions ///
    //////////////////////////
    function addSigner(address signer) external onlyOwner {
        allowedSigners[signer] = true;
        emit SignerAdded(signer);
    }

    function removeSigner(address signer) external onlyOwner {
        allowedSigners[signer] = false;
        emit SignerRemoved(signer);
    }

    function verifyTradeQuote(TradeQuote calldata quote, bytes calldata signature)
        external
        view
        returns (bytes32 quoteHash)
    {
        if (block.timestamp > quote.deadline) {
            revert QuoteVerifier__QuoteExpired();
        }
        if (quote.amount == 0) {
            revert QuoteVerifier__InvalidAmount();
        }

        // Prevent cross-market replay
        if (quote.market != msg.sender) {
            revert QuoteVerifier__InvalidMarket();
        }

        quoteHash = _hashTypedDataV4(
            keccak256(
                abi.encode(
                    TRADE_QUOTE_TYPEHASH,
                    quote.trader,
                    quote.market,
                    quote.outcome,
                    quote.amount,
                    quote.cost,
                    quote.deadline,
                    quote.nonce
                )
            )
        );

        address recoverredSigner = ECDSA.recover(quoteHash, signature);

        if (!allowedSigners[recoverredSigner]) {
            revert QuoteVerifier__UnauthorizedSigner();
        }
    }

    //////////////////////////
    /// VIEW FUNCTIONS ///
    //////////////////////////
    function isSigner(address signer) external view returns (bool) {
        return allowedSigners[signer];
    }
}
