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
    mapping(address trader => mapping(address market => uint256 lastNonce)) public traderNonces;

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
    error QuoteVerifier__InvalidAddress();
    error QuoteVerifier__InvalidNonce();

    //////////////////////////
    /// FUNCTIONS //////
    //////////////////////////

    constructor(address initialOwner) EIP712("PredictionMarket-QuoteVerifier", "1") {
        if (initialOwner == address(0)) {
            revert QuoteVerifier__InvalidAddress();
        }
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

        // Validate nonce is greater than last used nonce
        if (quote.nonce <= traderNonces[quote.trader][quote.market]) {
            revert QuoteVerifier__InvalidNonce();
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

        address recoveredSigner = ECDSA.recover(quoteHash, signature);

        if (!allowedSigners[recoveredSigner]) {
            revert QuoteVerifier__UnauthorizedSigner();
        }
    }

    /**
     * @notice Update nonce after successful trade execution
     * @dev Only callable by Market contract
     * @param trader The trader whose nonce to update
     * @param market The market address
     * @param nonce The nonce that was used
     */
    function updateNonce(address trader, address market, uint256 nonce) external {
        // Only the market contract can update nonces
        if (msg.sender != market) {
            revert QuoteVerifier__InvalidMarket();
        }
        if (nonce <= traderNonces[trader][market]) {
            revert QuoteVerifier__InvalidNonce();
        }
        traderNonces[trader][market] = nonce;
    }

    //////////////////////////
    /// VIEW FUNCTIONS ///
    //////////////////////////
    function isSigner(address signer) external view returns (bool) {
        return allowedSigners[signer];
    }
}
