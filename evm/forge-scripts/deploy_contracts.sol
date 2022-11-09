// SPDX-License-Identifier: Apache 2

pragma solidity ^0.8.0;

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
                bytes4(keccak256("setup(address,uint16,address,uint8,address)")),
                address(implementation),
                wormhole.chainId(),
                address(wormhole),
                uint8(1), // finality
                address(circleIntegration)
            )
        );

        relayer = ICircleRelayer(address(proxy));
    }

    function setInitialRelayerFee(
        address sourceToken,
        uint256 sourceRelayerFee,
        uint16 targetChainId,
        uint256 targetRelayerFee
    ) internal {
        // source chain relayer fee
        relayer.updateRelayerFee(
            wormhole.chainId(),
            sourceToken,
            sourceRelayerFee
        );

        // target chain relayer fee
        relayer.updateRelayerFee(
            targetChainId,
            sourceToken,
            targetRelayerFee
        );

        // confirm state was updated
        require(
            relayer.relayerFee(wormhole.chainId(), sourceToken) == sourceRelayerFee,
            "source relayer fee incorrect"
        );
        require(
            relayer.relayerFee(targetChainId, sourceToken) == targetRelayerFee,
            "target relayer fee incorrect"
        );
    }

    function setInitialSwapRate() internal {
        address usdc = vm.envAddress("USDC_ADDRESS");
        uint256 usdcSwapRate = vm.envUint("USDC_SWAP_RATE");

        // set the initial swap rate for native asset -> USDC
        relayer.updateNativeSwapRate(usdc, usdcSwapRate);

        // confirm state was updated
        require(
            relayer.nativeSwapRate(usdc) == usdcSwapRate,
            "swap rate incorrect"
        );
    }

    function setInitialMaxSwapAmount() internal {
        address usdc = vm.envAddress("USDC_ADDRESS");
        uint256 maxNativeSwapAmount = vm.envUint("MAX_NATIVE_SWAP_AMOUNT");

        // set the initial max native swap amount
        relayer.updateMaxSwapAmount(usdc, maxNativeSwapAmount);

        // confirm state was updated
        require(
            relayer.maxSwapAmount(usdc) == maxNativeSwapAmount,
            "max native swap amount incorrect"
        );
    }

    function run() public {
        // begin sending transactions
        vm.startBroadcast();

        // CircleRelayer.sol
        deployCircleRelayer();

        // CircleRelayer initial contract state setup
        setInitialRelayerFee(
            vm.envAddress("USDC_ADDRESS"),
            vm.envUint("SOURCE_CHAIN_USDC_RELAYER_FEE"),
            uint16(vm.envUint("TARGET_CHAIN_ID_ZERO")),
            vm.envUint("TARGET_CHAIN_USDC_RELAYER_FEE_ZERO")
        );
        setInitialSwapRate();
        setInitialMaxSwapAmount();

        // finished
        vm.stopBroadcast();
    }
}
