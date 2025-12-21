// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

import {MarketTypes} from "./MarketTypes.sol";

contract QuoteVerifier is ECDSA, EIP712, Ownable2Step {
    using ECDSA for bytes32;

    //////////////////////////
    /// STATE VARIABLES ///
    //////////////////////////
    bytes32 private constant TRADE_QUOTE_TYPEHASH = keccak256(
        "TradeQuote(address trader,address market,uint8 outcome,uint256 amount,uint256 cost,uint256 deadline,uint256 nonce)"
    );

    mapping(address => bool) isSigner;

    //////////////////////////
    /// EVENTS //////
    //////////////////////////
    event SignerAddedd(address signer);
    event SignerRemoved(address signer);

    //////////////////////////
    /// ERRORS //////
    //////////////////////////
    error QuoteVerifier__UnauthorizedSigner();
    error QuoteVerifier__InvalidSignature();
    error QuoteVerifier__InvalidDeadline();
    error QuoteVerifier__InvalidNonce();
    error QuoteVerifier__QuoteExpired();
    error QuoteVerifier__InvalidAmount();

    //////////////////////////
    /// FUNCTIONS //////
    //////////////////////////

    constructor() EIP712("PredictionMarket-QuoteVerifier", "1") {}

    //////////////////////////
    /// External Functions ///
    //////////////////////////
    function addSigner(address signer) external onlyOwner {
        isSigner[signer] = true;
        emit SignerAddedd(signer);
    }

    function removeSigner(address signer) {
        isSigner[signer] = false;
        emit SignerRemoved(signer);
    }

    function verifyTradeQuote(MarketTypes.TradeQuote calldata quote, byrtes calldata signature)
        external
        view
        returns (bytes32 quoteHash)
    {
        if (block.timestamp > quote.deadline) {
            revert QuoteVerifier__QuoteExpired();
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

        if (!isSigner[recoverredSigner]) {
            revert QuoteVerifier__UnauthorizedSigner();
        }
    }
}
