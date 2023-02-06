// SPDX-License-Identifier: Apache 2

pragma solidity ^0.8.17;

import "forge-std/Script.sol";
import "forge-std/console.sol";

import {IWormhole} from "../src/interfaces/IWormhole.sol";

import {ICircleRelayer} from "../src/interfaces/ICircleRelayer.sol";
import {CircleRelayerImplementation} from "../src/circle-relayer/CircleRelayerImplementation.sol";

contract ContractScript is Script {
    // Circle Integration contracts
    CircleRelayerImplementation implementation;

    // Circle Relayer instance (post deployment)
    ICircleRelayer relayer;

    // Wormhole
    IWormhole wormhole;

    function setUp() public {
        wormhole = IWormhole(vm.envAddress("RELEASE_WORMHOLE_ADDRESS"));
        relayer = ICircleRelayer(vm.envAddress("SOURCE_RELAYER_CONTRACT_ADDRESS"));
    }

    function deployCircleRelayerImplementation() public {
        // next Implementation
        implementation = new CircleRelayerImplementation();
    }

    function upgradeCircleRelayer() public {
        address newImplementation = address(implementation);

        // sanity check new implemenation
        require(newImplementation != address(0), "invalid implementation");
        require(!relayer.isInitialized(newImplementation), "already initialized");

        // upgrade the contract
        relayer.upgrade(wormhole.chainId(), newImplementation);

        // confirm upgrade
        require(relayer.isInitialized(newImplementation), "not initialized");
    }

    function run() public {
        // begin sending transactions
        vm.startBroadcast();

        // CircleRelayer.sol
        deployCircleRelayerImplementation();

        // upgrade the contract
        upgradeCircleRelayer();

        // finished
        vm.stopBroadcast();
    }
}
