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
        uint256 swapRatePrecision
    ) public {
        require(implementation != address(0), "invalid implementation");
        require(chainId > 0, "invalid chainId");
        require(wormhole != address(0), "invalid wormhole address");
        require(circleIntegration != address(0), "invalid circle integration address");
        require(swapRatePrecision != 0, "precision must be > 0");

        setOwner(_msgSender());
        setChainId(chainId);
        setWormhole(wormhole);
        setWormholeFinality(finality);
        setCircleIntegration(circleIntegration);
        setNativeSwapRatePrecision(swapRatePrecision);

        // set the implementation
        _upgradeTo(implementation);

        // call initialize function of the new implementation
        (bool success, bytes memory reason) = implementation.delegatecall(
            abi.encodeWithSignature("initialize()")
        );
        require(success, string(reason));
    }
}
