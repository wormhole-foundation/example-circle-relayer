// SPDX-License-Identifier: Apache 2
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../libraries/BytesLib.sol";

import {IWormhole} from "../interfaces/IWormhole.sol";

import "./CircleRelayerGovernance.sol";
import "./CircleRelayerMessages.sol";

/**
 * @title Circle Bridge Asset Relayer
 * @notice This contract composes on Wormhole's Circle Integration contracts to faciliate
 * one-click transfers of Circle Bridge supported assets cross chain.
 */
contract CircleRelayer is CircleRelayerMessages, CircleRelayerGovernance, ReentrancyGuard {
    using BytesLib for bytes;

    /**
     * @notice Calls Wormhole's Circle Integration contract to burn user specified tokens.
     * It emits a Wormhole message with instructions for how to handle relayer payments
     * on the target contract and the quantity of tokens to convert into native assets
     * for the user.
     * @param token Address of the Circle Bridge asset to be transferred.
     * @param amount Quantity of tokens to be transferred.
     * @param toNativeTokenAmount Amount of tokens to swap into native assets on
     * the target chain.
     * @param targetChain Wormhole chain ID of the target blockchain.
     * @param targetRecipientWallet User's wallet address on the target blockchain.
     * @return messageSequence Wormhole sequence for emitted TransferTokensWithRelay message.
     */
    function transferTokensWithRelay(
        address token,
        uint256 amount,
        uint256 toNativeTokenAmount,
        uint16 targetChain,
        bytes32 targetRecipientWallet
    ) public payable nonReentrant returns (uint64 messageSequence) {
        // sanity check input values
        require(amount > 0, "amount must be > 0");
        require(targetRecipientWallet != bytes32(0), "invalid target recipient");
        require(token != address(0), "token cannot equal address(0)");

        // cache the target contract address
        bytes32 targetContract = getRegisteredContract(targetChain);
        require(
            targetContract != bytes32(0),
            "CIRCLE-RELAYER: target not registered"
        );

        // transfer the tokens to this contract
        uint256 amountReceived = custodyTokens(token, amount);
        uint256 targetRelayerFee = relayerFee(targetChain, token);
        require(
            amountReceived > targetRelayerFee + toNativeTokenAmount,
            "insufficient amountReceived"
        );

        // Construct additional instructions to tell the receiving contract
        // how to handle the token redemption.
        TransferTokensWithRelay memory transferMessage = TransferTokensWithRelay({
            payloadId: 1,
            targetRelayerFee: targetRelayerFee,
            toNativeTokenAmount: toNativeTokenAmount,
            targetRecipientWallet: targetRecipientWallet
        });

        // cache circle integration instance
        ICircleIntegration integration = circleIntegration();

        // approve the circle integration contract to spend tokens
        SafeERC20.safeApprove(
            IERC20(token),
            address(integration),
            amountReceived
        );

        // transfer the tokens with instructions via the circle integration contract
        messageSequence = integration.transferTokensWithPayload(
            ICircleIntegration.TransferParameters({
                token: token,
                amount: amount,
                targetChain: targetChain,
                mintRecipient: targetContract
            }),
            0, // batchId = 0 to opt out of batching
            encodeTransferTokensWithRelay(transferMessage)
        );
    }

    /**
     * @notice Calls Wormhole's Circle Integration contract to complete the token transfer. Takes
     * custody of the minted tokens and sends the tokens to the target recipient.
     * It pays the relayer in the minted token denomination. If requested by the user,
     * it will perform a swap with the off-chain relayer to provide the user with native assets.
     * @param redeemParams Struct containing an attested Wormhole message, Circle Bridge message,
     * and Circle transfer attestation.
     */
    function redeemTokens(
        ICircleIntegration.RedeemParameters calldata redeemParams
    ) public payable {
        // cache circle integration instance
        ICircleIntegration integration = circleIntegration();

        /**
         * Mint tokens to this contract. Serves as a reentrancy protection,
         * since the circle integration contract will not allow the wormhole
         * message in the redeemParams to be replayed.
         */
        ICircleIntegration.DepositWithPayload memory deposit =
            integration.redeemTokensWithPayload(redeemParams);

        // parse the additional instructions from the deposit message
        TransferTokensWithRelay memory transferMessage = decodeTransferTokensWithRelay(
            deposit.payload
        );

        // verify that the sender is a registered contract
        require(
            deposit.fromAddress == getRegisteredContract(
                integration.getChainIdFromDomain(deposit.sourceDomain)
            ),
            "fromAddress is not a registered contract"
        );

        // cache the token and recipient addresses
        address token = bytes32ToAddress(deposit.token);
        address recipient = bytes32ToAddress(transferMessage.targetRecipientWallet);

        // If the recipient is self redeeming, send the full token amount to
        // the recipient. Revert if they attempt to send ether to this contract.
        if (msg.sender == recipient) {
            require(msg.value == 0, "recipient cannot swap native assets");

            // transfer the full token amount to the recipient
            SafeERC20.safeTransfer(
                IERC20(token),
                recipient,
                deposit.amount
            );

            // bail out
            return;
        }

        // handle native asset payments and refunds
        if (transferMessage.toNativeTokenAmount > 0) {
            /**
             * Compute the maximum amount of tokens that the user is allowed
             * to swap for native assets.
             *
             * Override the toNativeTokenAmount in the transferMessage if
             * the toNativeTokenAmount is greater than the maxToNativeAllowed.
             *
             * Compute the amount of native assets to send the recipient.
             */
            uint256 nativeAmountForRecipient;
            uint256 maxToNativeAllowed = calculateMaxSwapAmountIn(token);
            if (transferMessage.toNativeTokenAmount > maxToNativeAllowed) {
                transferMessage.toNativeTokenAmount = maxToNativeAllowed;
            }
            // compute amount of native asset to pay the recipient
            nativeAmountForRecipient = calculateNativeSwapAmountOut(
                token,
                transferMessage.toNativeTokenAmount
            );

            /**
             * The nativeAmountForRecipient can be zero if the user specifed a toNativeTokenAmount
             * that is too little to convert to native asset. We need to override the toNativeTokenAmount
             * to be zero if that is the case, that way the user receives the full amount of minted USDC.
             */
            if (nativeAmountForRecipient > 0) {
                // check to see if the relayer sent enough value
                require(
                    msg.value >= nativeAmountForRecipient,
                    "insufficient native asset amount"
                );

                // refund excess native asset to relayer if applicable
                uint256 relayerRefund = msg.value - nativeAmountForRecipient;
                if (relayerRefund > 0) {
                    payable(msg.sender).transfer(relayerRefund);
                }

                // send requested native asset to target recipient
                payable(recipient).transfer(nativeAmountForRecipient);
            } else {
                // override the toNativeTokenAmount in the transferMessage
                transferMessage.toNativeTokenAmount = 0;

                // refund the relayer any native asset sent to this contract
                if (msg.value > 0) {
                    payable(msg.sender).transfer(msg.value);
                }
            }
        }

        // add the token swap amount to the relayer fee
        uint256 amountForRelayer =
            transferMessage.targetRelayerFee + transferMessage.toNativeTokenAmount;

        // pay the relayer if relayerFee > 0 and the caller is not the recipient
        if (amountForRelayer > 0) {
            SafeERC20.safeTransfer(
                IERC20(token),
                msg.sender,
                amountForRelayer
            );
        }

        // pay the target recipient the remaining minted tokens
        SafeERC20.safeTransfer(
            IERC20(token),
            recipient,
            deposit.amount - amountForRelayer
        );
    }

    /**
     * @notice Calculates the max amount of tokens the user can convert to
     * native assets on this chain.
     * @dev The max amount of native assets the contract will swap with the user
     * is governed by the `maxNativeSwapAmount` state variable.
     * @param token Address of token being transferred.
     * @return maxAllowed The maximum number of tokens the user is allowed to
     * swap for native assets.
     */
    function calculateMaxSwapAmountIn(
        address token
    ) public view returns (uint256 maxAllowed) {
        // cache swap rate
        uint256 swapRate = nativeSwapRate(token);
        require(swapRate > 0, "swap rate not set");

        // cache token decimals
        uint8 tokenDecimals_ = tokenDecimals(token);
        uint8 nativeDecimals = nativeTokenDecimals();

        if (tokenDecimals_ > nativeDecimals) {
            maxAllowed =
                maxNativeSwapAmount(token) * swapRate *
                10 ** (tokenDecimals_ - nativeDecimals) / nativeSwapRatePrecision();
        } else {
            maxAllowed =
                (maxNativeSwapAmount(token) * swapRate) /
                (10 ** (nativeDecimals - tokenDecimals_) * nativeSwapRatePrecision());
        }
    }

    /**
     * @notice Calculates the amount of native assets that a user will receive
     * when swapping transferred tokens for native assets.
     * @dev The swap rate is governed by the `nativeSwapRate` state variable.
     * @param token Address of token being transferred.
     * @param toNativeAmount Quantity of tokens to be converted to native assets.
     * @return nativeAmount The exchange rate between native assets and the `toNativeAmount`
     * of transferred tokens.
     */
    function calculateNativeSwapAmountOut(
        address token,
        uint256 toNativeAmount
    ) public view returns (uint256 nativeAmount) {
        // cache swap rate
        uint256 swapRate = nativeSwapRate(token);
        require(swapRate > 0, "swap rate not set");

        // cache token decimals
        uint8 tokenDecimals_ = tokenDecimals(token);
        uint8 nativeDecimals = nativeTokenDecimals();

        if (tokenDecimals_ > nativeDecimals) {
            nativeAmount =
                nativeSwapRatePrecision() * toNativeAmount /
                (swapRate * 10 ** (tokenDecimals_ - nativeDecimals));
        } else {
            nativeAmount =
                nativeSwapRatePrecision() * toNativeAmount *
                10 ** (nativeDecimals - tokenDecimals_) / swapRate;
        }
    }

    function tokenDecimals(address token) internal view returns (uint8) {
        // fetch the token decimals
        (,bytes memory queriedDecimals) = token.staticcall(
            abi.encodeWithSignature("decimals()")
        );
        return abi.decode(queriedDecimals, (uint8));
    }

    function custodyTokens(address token, uint256 amount) internal returns (uint256) {
        // query own token balance before transfer
        (,bytes memory queriedBalanceBefore) = token.staticcall(
            abi.encodeWithSelector(IERC20.balanceOf.selector,
            address(this))
        );
        uint256 balanceBefore = abi.decode(queriedBalanceBefore, (uint256));

        // deposit USDC
        SafeERC20.safeTransferFrom(
            IERC20(token),
            msg.sender,
            address(this),
            amount
        );

        // query own token balance after transfer
        (,bytes memory queriedBalanceAfter) = token.staticcall(
            abi.encodeWithSelector(IERC20.balanceOf.selector,
            address(this))
        );
        uint256 balanceAfter = abi.decode(queriedBalanceAfter, (uint256));

        // this check is necessary since Circle's token contracts are upgradeable
        return balanceAfter - balanceBefore;
    }

    function bytes32ToAddress(bytes32 address_) public pure returns (address) {
        return address(uint160(uint256(address_)));
    }
}
