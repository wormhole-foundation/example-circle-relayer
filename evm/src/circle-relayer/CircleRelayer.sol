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

        // Construct additional instructions to tell the receiving contract
        // how to handle the token redemption.
        TransferTokensWithRelay memory transferMessage = TransferTokensWithRelay({
            payloadId: 1,
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
        ICircleIntegration.WormholeDepositWithPayload memory deposit =
            circleIntegration().redeemTokensWithPayload(redeemParams);

        // parse the additional instructions from the deposit message
        TransferTokensWithRelay memory transferMessage = decodeTransferTokensWithRelay(
            deposit.payload
        );

        // cache the token address and relayerFee
        address token = bytes32ToAddress(deposit.token);
        uint256 relayerFee = relayerFee();

        // pay the relayer
        SafeERC20.safeTransfer(
            IERC20(token),
            msg.sender,
            relayerFee
        );

        // Pay the target recipient the difference between the amount sent
        // and the relayer fee.
        SafeERC20.safeTransfer(
            IERC20(token),
            bytes32ToAddress(transferMessage.targetRecipientWallet),
            deposit.amount - relayerFee
        );
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
