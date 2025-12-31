// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/**
 * @title QuoteVerifier
 * @author Rahul Dindigala
 * @notice Verifies EIP-712 signed trade quotes and manages authorized signers
 * @dev Prevents replay attacks through nonce tracking and quote hash validation
 */
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
        "TradeQuote(address trader,address market,Outcome outcome,uint256 amount,uint256 cost,uint256 deadline,uint256 nonce,bool isSell,uint256 minAmountOut,uint256 minReturn)"
    );

    mapping(address signer => bool allowed) allowedSigners;
    mapping(address trader => mapping(address market => uint256 lastNonce)) public traderNonces;

    //////////////////////////
    /// EVENTS //////
    //////////////////////////
    event SignerAdded(address indexed signer);
    event SignerRemoved(address indexed signer);

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

    /**
     * @notice Initialize the QuoteVerifier contract
     * @param initialOwner Address that will own the contract
     */
    constructor(address initialOwner) EIP712("PredictionMarket-QuoteVerifier", "1") {
        if (initialOwner == address(0)) {
            revert QuoteVerifier__InvalidAddress();
        }
        _transferOwnership(initialOwner);
    }

    //////////////////////////
    /// External Functions ///
    //////////////////////////
    /**
     * @notice Add an authorized signer
     * @param signer Address to authorize for signing quotes
     */
    function addSigner(address signer) external onlyOwner {
        allowedSigners[signer] = true;
        emit SignerAdded(signer);
    }

    /**
     * @notice Remove an authorized signer
     * @param signer Address to revoke signing authorization from
     */
    function removeSigner(address signer) external onlyOwner {
        allowedSigners[signer] = false;
        emit SignerRemoved(signer);
    }

    /**
     * @notice Verify a signed trade quote
     * @dev Validates signature, nonce, deadline, and signer authorization
     * @param quote The trade quote to verify
     * @param signature The EIP-712 signature of the quote
     * @return quoteHash The hash of the verified quote (for replay prevention)
     * @custom:reverts QuoteVerifier__QuoteExpired If quote deadline has passed
     * @custom:reverts QuoteVerifier__InvalidAmount If quote amount is zero
     * @custom:reverts QuoteVerifier__InvalidMarket If quote market doesn't match caller
     * @custom:reverts QuoteVerifier__InvalidNonce If nonce is not greater than last used
     * @custom:reverts QuoteVerifier__UnauthorizedSigner If signer is not authorized
     */
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
                    quote.nonce,
                    quote.isSell,
                    quote.minAmountOut,
                    quote.minReturn
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
     * @dev Only callable by Market contract to prevent replay attacks
     * @param trader The trader whose nonce to update
     * @param market The market address
     * @param nonce The nonce that was used
     * @custom:reverts QuoteVerifier__InvalidMarket If caller is not the market contract
     * @custom:reverts QuoteVerifier__InvalidNonce If nonce is not greater than current
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
    /**
     * @notice Check if an address is an authorized signer
     * @param signer Address to check
     * @return bool True if address is authorized to sign quotes
     */
    function isSigner(address signer) external view returns (bool) {
        return allowedSigners[signer];
    }
}
