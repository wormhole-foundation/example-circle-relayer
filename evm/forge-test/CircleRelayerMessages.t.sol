// SPDX-License-Identifier: Apache 2
pragma solidity ^0.8.13;

import "forge-std/Test.sol";
import "forge-std/console.sol";

import {BytesLib} from "../src/libraries/BytesLib.sol";
import {WormholeSimulator} from "wormhole-solidity/WormholeSimulator.sol";
import {ForgeHelpers} from "wormhole-solidity/ForgeHelpers.sol";

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {IWormhole} from "../src/interfaces/IWormhole.sol";
import {ICircleRelayer} from "../src/interfaces/ICircleRelayer.sol";

import {CircleRelayerStructs} from "../src/circle-relayer/CircleRelayerStructs.sol";
import {CircleRelayerSetup} from "../src/circle-relayer/CircleRelayerSetup.sol";
import {CircleRelayerImplementation} from "../src/circle-relayer/CircleRelayerImplementation.sol";
import {CircleRelayerProxy} from "../src/circle-relayer/CircleRelayerProxy.sol";

/**
 * @title A Test Suite for the Circle-Relayer Smart Contracts
 */
contract CircleRelayerMessagesTest is Test, ForgeHelpers {
    using BytesLib for bytes;

    // dependencies
    WormholeSimulator wormholeSimulator;
    IWormhole wormhole;

    // Circle relayer contract
    ICircleRelayer relayer;

    /// @notice Sets up the wormholeSimulator contracts
    function setupWormhole() public {
        // Set up this chain's Wormhole
        wormholeSimulator = new WormholeSimulator(
            vm.envAddress("TESTING_WORMHOLE_ADDRESS"),
            uint256(vm.envBytes32("TESTING_DEVNET_GUARDIAN")));
        wormhole = wormholeSimulator.wormhole();
    }

    /// @notice Deploys CircleRelayer proxy contract and sets the initial state
    function setupCircleRelayer() public {
        // deploy Setup
        CircleRelayerSetup setup = new CircleRelayerSetup();

        // deploy Implementation
        CircleRelayerImplementation implementation =
            new CircleRelayerImplementation();

        // deploy Proxy
        CircleRelayerProxy proxy = new CircleRelayerProxy(
            address(setup),
            abi.encodeWithSelector(
                bytes4(
                    keccak256("setup(address,uint16,address,uint8,address,uint256)")
                ),
                address(implementation),
                uint16(wormhole.chainId()),
                address(wormhole),
                uint8(1), // finality
                vm.envAddress("TESTING_CIRCLE_INTEGRATION_ADDRESS"),
                1e8 // initial swap rate precision
            )
        );
        relayer = ICircleRelayer(address(proxy));

        // verify initial state
        assertEq(relayer.isInitialized(address(implementation)), true);
        assertEq(relayer.chainId(), wormhole.chainId());
        assertEq(address(relayer.wormhole()), address(wormhole));
        assertEq(relayer.wormholeFinality(), uint8(1));
        assertEq(
            address(relayer.circleIntegration()),
            vm.envAddress("TESTING_CIRCLE_INTEGRATION_ADDRESS")
        );
        assertEq(relayer.nativeSwapRatePrecision(), 1e8);
    }

    function setUp() public {
        // set up wormhole simulator
        setupWormhole();

        // now our contract
        setupCircleRelayer();
    }

    /**
     * @notice This test confirms that the contract will not encode
     * TransferTokensWithRelay messages when payloadId is not 1.
     */
    function testMessageSerializationWrongPayloadID(
        uint8 invalidPayloadId
    ) public {
        vm.assume(invalidPayloadId != 1);

        // expect call to encodeTransferTokensWithRelay to revert
        ICircleRelayer.TransferTokensWithRelay memory transferStruct =
            ICircleRelayer.TransferTokensWithRelay({
                payloadId: invalidPayloadId,
                targetRelayerFee: 1e10,
                toNativeTokenAmount: 1e1,
                targetRecipientWallet: addressToBytes32(address(this))
            });

        // expect the encodedTransferTokensWithRelay call to fail
        bytes memory encodedSignature = abi.encodeWithSignature(
            "encodeTransferTokensWithRelay((uint8,uint256,uint256,bytes32))",
            transferStruct
        );
        expectRevert(
            address(relayer),
            encodedSignature,
            "invalid payloadId"
        );
    }

    /**
     * @notice This test confirms that the contract is able serialize and
     * deserialize the TransferTokensWithRelay message.
     */
    function testMessageDeserialization(
        uint256 targetRelayerFee,
        uint256 toNativeAmount,
        bytes32 targetRecipientWallet
        ) public {
        vm.assume(targetRecipientWallet != bytes32(0));
        vm.assume(toNativeAmount < targetRelayerFee);

        // encode the messag by calling encodeTransferTokensWithRelay
        bytes memory encodedMessage = relayer.encodeTransferTokensWithRelay(
            ICircleRelayer.TransferTokensWithRelay({
                payloadId: 1,
                targetRelayerFee: targetRelayerFee,
                toNativeTokenAmount: toNativeAmount,
                targetRecipientWallet: targetRecipientWallet
            })
        );

        // decode the message by calling decodeTransferTokensWithRelay
        ICircleRelayer.TransferTokensWithRelay memory parsed =
            relayer.decodeTransferTokensWithRelay(encodedMessage);


        // verify the parsed output
        assertEq(parsed.payloadId, 1);
        assertEq(parsed.targetRelayerFee, targetRelayerFee);
        assertEq(parsed.toNativeTokenAmount, toNativeAmount);
        assertEq(parsed.targetRecipientWallet, targetRecipientWallet);
    }

    /**
     * @notice This test confirms that decodeTransferTokensWithRelay reverts
     * when a message has an unexpected payloadId.
     */
    function testIncorrectMessagePayloadId(
        uint256 targetRelayerFee,
        uint256 toNativeAmount,
        bytes32 targetRecipientWallet
        ) public {
        vm.assume(targetRecipientWallet != bytes32(0));
        vm.assume(toNativeAmount < targetRelayerFee);

        // encode the messag by calling encodeTransferTokensWithRelay
        bytes memory encodedMessage = relayer.encodeTransferTokensWithRelay(
            ICircleRelayer.TransferTokensWithRelay({
                payloadId: 1,
                targetRelayerFee: targetRelayerFee,
                toNativeTokenAmount: toNativeAmount,
                targetRecipientWallet: targetRecipientWallet
            })
        );

        // Convert the first byte (payloadId) from 1 to 2
        bytes memory alteredEncodedMessage = abi.encodePacked(
            uint8(2),
            encodedMessage.slice(1, encodedMessage.length - 1)
        );

        // expect the decodeTransferTokensWithRelay call to revert
        vm.expectRevert("CIRCLE_RELAYER: invalid message payloadId");
        relayer.decodeTransferTokensWithRelay(alteredEncodedMessage);
    }

    /**
     * @notice This test confirms that decodeTransferTokensWithRelay reverts
     * when a message has an unexpected payloadId.
     */
    function testInvalidMessageLength(
        uint256 targetRelayerFee,
        uint256 toNativeAmount,
        bytes32 targetRecipientWallet
        ) public {
        vm.assume(targetRecipientWallet != bytes32(0));
        vm.assume(toNativeAmount < targetRelayerFee);

        // encode the messag by calling encodeTransferTokensWithRelay
        bytes memory encodedMessage = relayer.encodeTransferTokensWithRelay(
            ICircleRelayer.TransferTokensWithRelay({
                payloadId: 1,
                targetRelayerFee: targetRelayerFee,
                toNativeTokenAmount: toNativeAmount,
                targetRecipientWallet: targetRecipientWallet
            })
        );

        // add some additional bytes to the encoded message
        bytes memory alteredEncodedMessage = abi.encodePacked(
            encodedMessage,
            uint256(42069)
        );

        // expect the decodeTransferTokensWithRelay call to revert
        vm.expectRevert("CIRCLE_RELAYER: invalid message length");
        relayer.decodeTransferTokensWithRelay(alteredEncodedMessage);
    }
}