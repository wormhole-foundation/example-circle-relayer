// SPDX-License-Identifier: Apache 2

pragma solidity ^0.8.0;

import "forge-std/Script.sol";
import "forge-std/console.sol";

import {ICircleRelayer} from "../src/interfaces/ICircleRelayer.sol";

contract ContractScript is Script {
    // Circle Relayer instance
    ICircleRelayer relayer;

    function setUp() public {
        relayer = ICircleRelayer(vm.envAddress("SOURCE_CONTRACT_ADDRESS"));
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

    function run() public {
        // begin sending transactions
        vm.startBroadcast();

        // register contracts
        registerContracts(
            uint16(vm.envUint("TARGET_CHAIN_ID_ZERO")),
            bytes32(uint256(uint160(vm.envAddress("TARGET_CONTRACT_ADDRESS_ZERO"))))
        );

        // finished
        vm.stopBroadcast();
    }
}
