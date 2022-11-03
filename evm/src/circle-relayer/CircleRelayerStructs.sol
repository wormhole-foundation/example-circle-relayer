// SPDX-License-Identifier: Apache 2
pragma solidity ^0.8.13;

contract CircleRelayerStructs {
    struct TransferTokensWithRelay {
        uint8 payloadId; // == 1
        uint256 toNativeTokenAmount;
        bytes32 targetRecipientWallet;
    }
}
