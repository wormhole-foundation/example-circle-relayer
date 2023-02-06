// SPDX-License-Identifier: Apache 2
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Upgrade.sol";
import {Context} from "@openzeppelin/contracts/utils/Context.sol";

import "./CircleRelayerSetters.sol";

contract CircleRelayerSetup is CircleRelayerSetters, ERC1967Upgrade, Context {
    function setup(
        address implementation,
        uint16 chainId,
        address wormhole,
        address circleIntegration,
        uint8 nativeTokenDecimals
    ) public {
        require(implementation != address(0), "invalid implementation");
        require(chainId > 0, "invalid chainId");
        require(wormhole != address(0), "invalid wormhole address");
        require(circleIntegration != address(0), "invalid circle integration address");
        require(nativeTokenDecimals > 0, "invalid native decimals");

        setOwner(_msgSender());
        setChainId(chainId);
        setWormhole(wormhole);
        setCircleIntegration(circleIntegration);
        setNativeTokenDecimals(nativeTokenDecimals);

        // set initial swap rate precision to 1e8
        setNativeSwapRatePrecision(1e8);

        // set the implementation
        _upgradeTo(implementation);

        // call initialize function of the new implementation
        (bool success, bytes memory reason) = implementation.delegatecall(
            abi.encodeWithSignature("initialize()")
        );
        require(success, string(reason));
    }
}
