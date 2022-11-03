// SPDX-License-Identifier: Apache 2
pragma solidity ^0.8.13;

import "./CircleRelayerState.sol";

contract CircleRelayerSetters is CircleRelayerState {
    function setOwner(address owner_) internal {
        _state.owner = owner_;
    }

    function setPendingOwner(address pendingOwner_) internal {
        _state.pendingOwner = pendingOwner_;
    }

    function setInitialized(address implementatiom) internal {
        _state.initializedImplementations[implementatiom] = true;
    }

    function setWormhole(address wormhole_) internal {
        _state.wormhole = payable(wormhole_);
    }

    function setChainId(uint16 chainId_) internal {
        _state.chainId = chainId_;
    }

    function setWormholeFinality(uint8 finality) internal {
        _state.wormholeFinality = finality;
    }

    function setCircleIntegration(address circleIntegration_) internal {
        _state.circleIntegration = circleIntegration_;
    }

    function setRelayerFee(uint256 fee) internal {
        _state.relayerFee = fee;
    }

    function _registerContract(uint16 chainId_, bytes32 contract_) internal {
        _state.registeredContracts[chainId_] = contract_;
    }

    function consumeMessage(bytes32 hash) internal {
        _state.consumedMessages[hash] = true;
    }
}
