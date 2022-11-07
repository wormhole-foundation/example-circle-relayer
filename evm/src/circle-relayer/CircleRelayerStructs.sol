// SPDX-License-Identifier: Apache 2
pragma solidity ^0.8.13;

contract CircleRelayerStructs {
    struct TransferTokensWithRelay {
        uint8 payloadId; // == 1
        uint16 targetChain; // off-chain relayer process will use this
        uint256 toNativeTokenAmount;
        bytes32 targetRecipientWallet;
    }
}
