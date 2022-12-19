// SPDX-License-Identifier: Apache 2
pragma solidity ^0.8.13;

import "../libraries/BytesLib.sol";

import "./CircleRelayerStructs.sol";

contract CircleRelayerMessages is CircleRelayerStructs {
    using BytesLib for bytes;

    function encodeTransferTokensWithRelay(
        TransferTokensWithRelay memory transfer
    ) public pure returns (bytes memory) {
        require(transfer.payloadId == 1, "invalid payloadId");
        return abi.encodePacked(
            transfer.payloadId,
            transfer.targetRelayerFee,
            transfer.toNativeTokenAmount,
            transfer.targetRecipientWallet
        );
    }

    function decodeTransferTokensWithRelay(
        bytes memory encoded
    ) public pure returns (TransferTokensWithRelay memory transfer) {
        uint256 index = 0;

        // parse the payloadId
        transfer.payloadId = encoded.toUint8(index);
        index += 1;

        require(transfer.payloadId == 1, "CIRCLE_RELAYER: invalid message payloadId");

        // target relayer fee
        transfer.targetRelayerFee = encoded.toUint256(index);
        index += 32;

        // amount of tokens to convert to native currency
        transfer.toNativeTokenAmount = encoded.toUint256(index);
        index += 32;

        // recipient of the transfered tokens and native assets
        transfer.targetRecipientWallet = encoded.toBytes32(index);
        index += 32;

        require(index == encoded.length, "CIRCLE_RELAYER: invalid message length");
    }
}
