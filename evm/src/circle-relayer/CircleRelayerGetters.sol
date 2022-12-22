// SPDX-License-Identifier: Apache 2
pragma solidity ^0.8.13;

import {IWormhole} from "../interfaces/IWormhole.sol";
import {ICircleIntegration} from "../interfaces/ICircleIntegration.sol";

import "./CircleRelayerSetters.sol";

contract CircleRelayerGetters is CircleRelayerSetters {
    function owner() public view returns (address) {
        return _state.owner;
    }

    function pendingOwner() public view returns (address) {
        return _state.pendingOwner;
    }

    function isInitialized(address impl) public view returns (bool) {
        return _state.initializedImplementations[impl];
    }

    function wormhole() public view returns (IWormhole) {
        return IWormhole(_state.wormhole);
    }

    function chainId() public view returns (uint16) {
        return _state.chainId;
    }

    function wormholeFinality() public view returns (uint8) {
        return _state.wormholeFinality;
    }

    function circleIntegration() public view returns (ICircleIntegration) {
        return ICircleIntegration(_state.circleIntegration);
    }

    function relayerFee(uint16 chainId_, address token) public view returns (uint256) {
        return _state.relayerFees[chainId_][token];
    }

    function nativeSwapRatePrecision() public view returns (uint256) {
        return _state.nativeSwapRatePrecision;
    }

    function nativeSwapRate(address token) public view returns (uint256) {
        return _state.nativeSwapRates[token];
    }

    function maxNativeSwapAmount(address token) public view returns (uint256) {
        return _state.maxNativeSwapAmount[token];
    }

    function getRegisteredContract(uint16 emitterChainId) public view returns (bytes32) {
        return _state.registeredContracts[emitterChainId];
    }
}
