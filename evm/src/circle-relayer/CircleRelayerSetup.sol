// SPDX-License-Identifier: Apache 2
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Upgrade.sol";
import {Context} from "@openzeppelin/contracts/utils/Context.sol";

import "./CircleRelayerSetters.sol";

contract CircleRelayerSetup is CircleRelayerSetters, ERC1967Upgrade, Context {
    function setup(
        address implementation,
        uint16 chainId,
        address wormhole,
        uint8 finality,
        address circleIntegration,
        uint256 redemptionRelayerFee
    ) public {
        require(implementation != address(0), "invalid implementation");
        require(chainId > 0, "invalid chainId");
        require(wormhole != address(0), "invalid wormhole address");
        require(circleIntegration != address(0), "invalid circle integration address");

        setOwner(_msgSender());
        setChainId(chainId);
        setWormhole(wormhole);
        setWormholeFinality(finality);
        setCircleIntegration(circleIntegration);

        // Set relayerFee for this contract, the relayerFee for target contracts
        // should be registered via the `updateRelayerFee` method.
        setRelayerFee(chainId, redemptionRelayerFee);

        // Set the swapRate precision to 1e8
        setNativeSwapRatePrecision(1e8);

        // set the implementation
        _upgradeTo(implementation);

        // call initialize function of the new implementation
        (bool success, bytes memory reason) = implementation.delegatecall(abi.encodeWithSignature("initialize()"));
        require(success, string(reason));
    }
}
