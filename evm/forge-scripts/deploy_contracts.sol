// SPDX-License-Identifier: Apache 2

pragma solidity ^0.8.17;

import "forge-std/Script.sol";
import "forge-std/console.sol";

import {IWormhole} from "../src/interfaces/IWormhole.sol";
import {ICircleIntegration} from "../src/interfaces/ICircleIntegration.sol";
import {ICircleRelayer} from "../src/interfaces/ICircleRelayer.sol";

import {CircleRelayerSetup} from "../src/circle-relayer/CircleRelayerSetup.sol";
import {CircleRelayerImplementation} from "../src/circle-relayer/CircleRelayerImplementation.sol";
import {CircleRelayerProxy} from "../src/circle-relayer/CircleRelayerProxy.sol";

contract ContractScript is Script {
    IWormhole wormhole;
    ICircleIntegration circleIntegration;

    // Circle Integration contracts
    CircleRelayerSetup setup;
    CircleRelayerImplementation implementation;
    CircleRelayerProxy proxy;

    // Circle Relayer instance (post deployment)
    ICircleRelayer relayer;

    function setUp() public {
        wormhole = IWormhole(vm.envAddress("RELEASE_WORMHOLE_ADDRESS"));
        circleIntegration = ICircleIntegration(vm.envAddress("RELEASE_CIRCLE_INTEGRATION_ADDRESS"));
    }

    function deployCircleRelayer() public {
        // first Setup
        setup = new CircleRelayerSetup();

        // next Implementation
        implementation = new CircleRelayerImplementation();

        // setup Proxy using Implementation
        proxy = new CircleRelayerProxy(
            address(setup),
            abi.encodeWithSelector(
                bytes4(keccak256("setup(address,uint16,address,address,uint8)")),
                address(implementation),
                wormhole.chainId(),
                address(wormhole),
                address(circleIntegration),
                uint8(vm.envUint("RELEASE_NATIVE_TOKEN_DECIMALS"))
            )
        );

        relayer = ICircleRelayer(address(proxy));
    }

    function run() public {
        // begin sending transactions
        vm.startBroadcast();

        // CircleRelayer.sol
        deployCircleRelayer();

        // finished
        vm.stopBroadcast();
    }
}
