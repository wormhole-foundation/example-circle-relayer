// SPDX-License-Identifier: Apache 2

pragma solidity ^0.8.17;

import "forge-std/Script.sol";
import "forge-std/console.sol";

import {IWormhole} from "../src/interfaces/IWormhole.sol";
import {ICircleIntegration} from "../src/interfaces/ICircleIntegration.sol";
import {ICircleRelayer} from "../src/interfaces/ICircleRelayer.sol";

import {CircleRelayer} from "../src/circle-relayer/CircleRelayer.sol";

contract ContractScript is Script {
    IWormhole wormhole;
    ICircleIntegration circleIntegration;

    // Circle Relayer instance (post deployment)
    ICircleRelayer relayer;

    function setUp() public {
        wormhole = IWormhole(vm.envAddress("RELEASE_WORMHOLE_ADDRESS"));
        circleIntegration = ICircleIntegration(vm.envAddress("RELEASE_CIRCLE_INTEGRATION_ADDRESS"));
    }

    function deployCircleRelayer() public {
        // constructor args
        address feeRecipient = vm.envAddress("RELEASE_FEE_RECIPIENT");
        address ownerAssistant = vm.envAddress("RELEASE_OWNER_ASSISTANT");

        // deploy
        CircleRelayer deployedRelayer = new CircleRelayer(
            address(circleIntegration),
            uint8(vm.envUint("RELEASE_NATIVE_TOKEN_DECIMALS")),
            feeRecipient,
            ownerAssistant
        );
        relayer = ICircleRelayer(address(deployedRelayer));

        // verify getters
        require(relayer.chainId() == wormhole.chainId());
        require(address(relayer.wormhole()) == address(wormhole));
        require(
            address(relayer.circleIntegration()) ==
            address(circleIntegration)
        );
        require(relayer.feeRecipient() == feeRecipient);
        require(relayer.ownerAssistant() == ownerAssistant);
        require(relayer.nativeSwapRatePrecision() == 1e8);
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
