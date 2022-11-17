// SPDX-License-Identifier: Apache 2
pragma solidity ^0.8.13;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../libraries/BytesLib.sol";

import {IWormhole} from "../interfaces/IWormhole.sol";

import "./CircleRelayerGovernance.sol";
import "./CircleRelayerMessages.sol";

contract CircleRelayer is CircleRelayerMessages, CircleRelayerGovernance, ReentrancyGuard {
    using BytesLib for bytes;

    function transferTokensWithRelay(
        address token,
        uint256 amount,
        uint256 toNativeTokenAmount,
        uint16 targetChain,
        bytes32 targetRecipientWallet
    ) public payable nonReentrant returns (uint64 messageSequence) {
        // cache circle integration instance
        ICircleIntegration integration = circleIntegration();

        // check to see if token is accepted by the circle integration contract
        require(integration.isAcceptedToken(token), "token not accepted");

        // confirm that the user sent enough value to cover wormhole's message fee
        require(msg.value == wormhole().messageFee(), "insufficient value");

        // transfer the token to this contract
        uint256 amountReceived = custodyTokens(token, amount);
        require(
            amountReceived > relayerFee(targetChain) + toNativeTokenAmount,
            "insufficient amountReceived"
        );

        // Construct additional instructions to tell the receiving contract
        // how to handle the token redemption.
        TransferTokensWithRelay memory transferMessage = TransferTokensWithRelay({
            payloadId: 1,
            targetChain: targetChain,
            toNativeTokenAmount: toNativeTokenAmount,
            targetRecipientWallet: targetRecipientWallet
        });

        // approve the circle integration contract to spend tokens
        SafeERC20.safeApprove(
            IERC20(token),
            address(integration),
            amountReceived
        );

        // transfer the tokens with instructions via the circle integration contract
        messageSequence = integration.transferTokensWithPayload(
            token,
            amount,
            targetChain,
            getRegisteredContract(targetChain),
            encodeTransferTokensWithRelay(transferMessage)
        );
    }

    function redeemTokens(
        ICircleIntegration.RedeemParameters memory redeemParams
    ) public payable nonReentrant {
        // mint USDC to this contract
        ICircleIntegration.DepositWithPayload memory deposit =
            integration.redeemTokensWithPayload(redeemParams);

        // parse the additional instructions from the deposit message
        TransferTokensWithRelay memory transferMessage = decodeTransferTokensWithRelay(
            deposit.payload
        );

        // cache the token, recipient address and relayerFee
        address token = bytes32ToAddress(deposit.token);
        address recipient = bytes32ToAddress(transferMessage.targetRecipientWallet);
        uint256 relayerFee = relayerFee(chainId());

        // handle native asset payments and refunds
        if (transferMessage.toNativeTokenAmount > 0) {
            // compute amount of native asset to pay the recipient
            uint256 nativeAmountForRecipient = calculateNativeSwapAmount(
                token,
                transferMessage.toNativeTokenAmount
            );

            // check to see if the relayer sent enough value
            require(
                msg.value >= nativeAmountForRecipient,
                "insufficient native asset amount"
            );

            // cache the excess value sent by the relayer
            uint256 relayerRefund = msg.value - nativeAmountForRecipient;

            // refund excess native asset to relayer if applicable
            if (relayerRefund > 0) {
                payable(msg.sender).transfer(relayerRefund);
            }

            // send requested native asset to target recipient
            payable(recipient).transfer(nativeAmountForRecipient);
        }

        // pay the relayer in the minted token denomination
        SafeERC20.safeTransfer(
            IERC20(token),
            msg.sender,
            relayerFee
        );

        // pay the target recipient the remaining minted tokens
        SafeERC20.safeTransfer(
            IERC20(token),
            recipient,
            deposit.amount - relayerFee - transferMessage.toNativeTokenAmount
        );
    }

    function calculateNativeSwapAmount(
        address token,
        uint256 toNativeAmount
    ) public view returns (uint256) {
        return
            nativeSwapRatePrecision() * toNativeAmount /
            nativeSwapRate(token) * 10 ** (18 - tokenDecimals(token));
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
