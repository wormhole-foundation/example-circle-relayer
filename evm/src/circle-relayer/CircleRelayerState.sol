// SPDX-License-Identifier: Apache 2
pragma solidity ^0.8.13;

import {IWormhole} from "../interfaces/IWormhole.sol";

contract CircleRelayerStorage {
    struct State {
        // Wormhole chain ID of this contract
        uint16 chainId;

        // The number of block confirmations needed before the wormhole network
        // will attest a message.
        uint8 wormholeFinality;

        // owner of this contract
        address owner;

        // intermediate state when transfering contract ownership
        address pendingOwner;

        // address of the Wormhole contract on this chain
        address wormhole;

        // address of the trusted Circle Integration contract on this chain
        address circleIntegration;

        // precision of the nativeSwapRates, this value should NEVER be set to zero
        uint256 nativeSwapRatePrecision;

        // mapping of chainId to source token address to relayerFee
        mapping(uint16 => mapping(address => uint256)) relayerFees;

        // mapping of source token address to native asset swap rate (nativePriceUSD/tokenPriceUSD)
        mapping(address => uint256) nativeSwapRates;

        // mapping of source token address to maximum native asset swap amount allowed
        mapping(address => uint256) maxNativeSwapAmount;

        // mapping of initialized implementations
        mapping(address => bool) initializedImplementations;

        // Wormhole chain ID to registered contract address mapping
        mapping(uint16 => bytes32) registeredContracts;

        // verified message hash to boolean
        mapping(bytes32 => bool) consumedMessages;

        // storage gap
        uint256[50] ______gap;
    }
}

contract CircleRelayerState {
    CircleRelayerStorage.State _state;
}

