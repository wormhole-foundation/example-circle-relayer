// SPDX-License-Identifier: Apache 2

pragma solidity ^0.8.17;

import "forge-std/Script.sol";
import "forge-std/console.sol";

import {ICircleRelayer} from "../src/interfaces/ICircleRelayer.sol";
import {IWormhole} from "../src/interfaces/IWormhole.sol";

interface IERC20 {
    function approve(address spender, uint256 amount) external returns (bool);
}

contract ContractScript is Script {
    // Circle Relayer instance
    ICircleRelayer relayer;

    function setUp() public {
        relayer = ICircleRelayer(vm.envAddress("SOURCE_RELAYER_CONTRACT_ADDRESS"));
    }

    function transferTokensWithRelay(
        address token,
        uint256 amount,
        uint256 toNativeTokenAmount,
        uint16 targetChain,
        bytes32 targetRecipient
    ) internal {
        console.log("Transferring token: %s to chain: %s", token, targetChain);
        console.log("Amount: %s, toNative: %s", amount, toNativeTokenAmount);

        // fetch the relayerFee
        uint256 relayerFee = relayer.relayerFee(targetChain, token);
        uint256 swapRate = relayer.nativeSwapRate(token);

        console.log(
            "NativeSwapRate: %s, RelayerFee: %s",
            swapRate,
            relayerFee
        );

        // approve relayer to spend tokens
        IERC20(token).approve(address(relayer), amount);

        // test transfer tokens
        relayer.transferTokensWithRelay(
            token,
            amount,
            toNativeTokenAmount,
            targetChain,
            targetRecipient
        );
    }

    function run() public {
        // begin sending transactions
        vm.startBroadcast();

        // env variables
        address usdc = vm.envAddress("SOURCE_USDC_ADDRESS");
        uint16 targetChain = uint16(vm.envUint("TARGET_CHAIN_ID"));
        bytes32 targetRecipient = bytes32(uint256(uint160(msg.sender)));

        // user set amount params
        uint256 amount = 1e6;
        uint256 toNativeAmount = 0;

        require(amount > 0 && toNativeAmount < amount, "invalid amounts");

        // do the thing
        transferTokensWithRelay(
            usdc,
            amount,
            toNativeAmount,
            targetChain,
            targetRecipient
        );

        // finished
        vm.stopBroadcast();
    }
}
