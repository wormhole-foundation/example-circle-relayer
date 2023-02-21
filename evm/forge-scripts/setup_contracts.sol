// SPDX-License-Identifier: Apache 2

pragma solidity ^0.8.17;

import "forge-std/Script.sol";
import "forge-std/console.sol";

import {ICircleRelayer} from "../src/interfaces/ICircleRelayer.sol";
import {IWormhole} from "../src/interfaces/IWormhole.sol";

contract ContractScript is Script {
    // Circle Relayer instance
    ICircleRelayer relayer;

    // Wormhole
    IWormhole wormhole;

    function setUp() public {
        wormhole = IWormhole(vm.envAddress("RELEASE_WORMHOLE_ADDRESS"));
        relayer = ICircleRelayer(vm.envAddress("SOURCE_RELAYER_CONTRACT_ADDRESS"));
    }

    function registerContracts(uint16 chainId, bytes32 contractAddress) internal {
        // register the target contract with the relayer
        relayer.registerContract(chainId, contractAddress);

        // confirm state was updated
        require(
            relayer.getRegisteredContract(chainId) == contractAddress,
            "contract not registered"
        );
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

    function setInitialSwapRate(address usdc) internal {
        uint256 usdcSwapRate = vm.envUint("NATIVE_TO_USDC_SWAP_RATE");

        // set the initial swap rate for native asset -> USDC
        relayer.updateNativeSwapRate(wormhole.chainId(), usdc, usdcSwapRate);

        // confirm state was updated
        require(
            relayer.nativeSwapRate(usdc) == usdcSwapRate,
            "swap rate incorrect"
        );
    }

    function setInitialMaxSwapAmount(address usdc) internal {
        uint256 maxNativeSwapAmount = vm.envUint("MAX_NATIVE_SWAP_AMOUNT");

        // set the initial max native swap amount
        relayer.updateMaxNativeSwapAmount(wormhole.chainId(), usdc, maxNativeSwapAmount);

        // confirm state was updated
        require(
            relayer.maxNativeSwapAmount(usdc) == maxNativeSwapAmount,
            "max native swap amount incorrect"
        );
    }

    function run() public {
        // begin sending transactions
        vm.startBroadcast();

        address usdc = vm.envAddress("SOURCE_USDC_ADDRESS");

        // register contracts
        registerContracts(
            uint16(vm.envUint("TARGET_CHAIN_ID")),
            bytes32(uint256(uint160(vm.envAddress("TARGET_RELAYER_CONTRACT_ADDRESS"))))
        );

        // CircleRelayer initial contract state setup
        setInitialRelayerFee(
            usdc,
            vm.envUint("SOURCE_USDC_RELAYER_FEE"),
            uint16(vm.envUint("TARGET_CHAIN_ID")),
            vm.envUint("TARGET_USDC_RELAYER_FEE")
        );
        setInitialSwapRate(usdc);
        setInitialMaxSwapAmount(usdc);

        // finished
        vm.stopBroadcast();
    }
}
