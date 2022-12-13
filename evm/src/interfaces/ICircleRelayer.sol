// SPDX-License-Identifier: Apache 2

pragma solidity ^0.8.13;

import {IWormhole} from "./IWormhole.sol";
import {ICircleIntegration} from "./ICircleIntegration.sol";

interface ICircleRelayer {
    struct TransferTokensWithRelay {
        uint8 payloadId; // == 1
        uint256 targetRelayerFee;
        uint256 toNativeTokenAmount;
        bytes32 targetRecipientWallet;
    }

    function transferTokensWithRelay(
        address token,
        uint256 amount,
        uint256 toNativeTokenAmount,
        uint16 targetChain,
        bytes32 targetRecipientWallet
    ) external payable returns (uint64 messageSequence);

    function redeemTokens(ICircleIntegration.RedeemParameters memory redeemParams) external payable;

     function calculateMaxSwapAmount(address token) external view returns (uint256);

    function calculateNativeSwapAmount(address token, uint256 toNativeAmount) external view returns (uint256);

    function bytes32ToAddress(bytes32 address_) external pure returns (address);

    function upgrade(uint16 chainId_, address newImplementation) external;

    function updateWormholeFinality(uint16 chainId_, uint8 newWormholeFinality) external;

    function submitOwnershipTransferRequest(uint16 chainId_, address newOwner) external;

    function confirmOwnershipTransferRequest() external;

    function registerContract(uint16 chainId_, bytes32 contractAddress) external;

    function updateRelayerFee(uint16 chainId_, address token, uint256 amount) external;

    function updateNativeSwapRate(uint16 chainId_, address token, uint256 swapRate) external;

    function updateNativeSwapRatePrecision(uint16 chainId_, uint256 nativeSwapRatePrecision_) external;

    function updateMaxSwapAmount(uint16 chainId_, address token, uint256 maxAmount) external;

    function owner() external view returns (address);

    function pendingOwner() external view returns (address);

    function isInitialized(address impl) external view returns (bool);

    function wormhole() external view returns (IWormhole);

    function chainId() external view returns (uint16);

    function wormholeFinality() external view returns (uint8);

    function circleIntegration() external view returns (ICircleIntegration);

    function relayerFee(uint16 chainId_, address token) external view returns (uint256);

    function nativeSwapRatePrecision() external view returns (uint256);

    function nativeSwapRate(address token) external view returns (uint256);

    function maxSwapAmount(address token) external view returns (uint256);

    function getRegisteredContract(uint16 emitterChainId) external view returns (bytes32);
}
