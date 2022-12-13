// SPDX-License-Identifier: Apache 2
pragma solidity ^0.8.13;

import "forge-std/Test.sol";
import "forge-std/console.sol";

import {BytesLib} from "../src/libraries/BytesLib.sol";
import {WormholeSimulator} from "wormhole-solidity/WormholeSimulator.sol";

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {IWormhole} from "../src/interfaces/IWormhole.sol";
import {IUSDC} from "../src/interfaces/IUSDC.sol";
import {ICircleRelayer} from "../src/interfaces/ICircleRelayer.sol";

import {CircleRelayerStructs} from "../src/circle-relayer/CircleRelayerStructs.sol";
import {CircleRelayerSetup} from "../src/circle-relayer/CircleRelayerSetup.sol";
import {CircleRelayerImplementation} from "../src/circle-relayer/CircleRelayerImplementation.sol";
import {CircleRelayerProxy} from "../src/circle-relayer/CircleRelayerProxy.sol";

/**
 * @title A Test Suite for the Circle-Relayer Smart Contracts
 */
contract CircleRelayerTest is Test {
    using BytesLib for bytes;

    // USDC
    IUSDC usdc;

    // dependencies
    WormholeSimulator wormholeSimulator;
    IWormhole wormhole;

    // Circle relayer contract
    ICircleRelayer relayer;

    /// @notice Mints USDC to this contract
    function mintUSDC(uint256 amount) public {
        require(
            amount <= type(uint256).max - usdc.totalSupply(),
            "total supply overflow"
        );
        usdc.mint(address(this), amount);
    }

    /// @notice Sets up the wormholeSimulator contracts
    function setupWormhole() public {
        // Set up this chain's Wormhole
        wormholeSimulator = new WormholeSimulator(
            vm.envAddress("TESTING_WORMHOLE_ADDRESS"),
            uint256(vm.envBytes32("TESTING_DEVNET_GUARDIAN")));
        wormhole = wormholeSimulator.wormhole();
    }

    /**
     * @notice Takes control of USDC master minter and USDC tokens
     * to this test contract.
     */
    function setupUSDC() public {
        usdc = IUSDC(vm.envAddress("TESTING_USDC_TOKEN_ADDRESS"));

        (, bytes memory queriedDecimals) = address(usdc).staticcall(
            abi.encodeWithSignature("decimals()")
        );
        uint8 decimals = abi.decode(queriedDecimals, (uint8));
        require(decimals == 6, "wrong USDC");

        // spoof .configureMinter() call with the master minter account
        // allow this test contract to mint USDC
        vm.prank(usdc.masterMinter());
        usdc.configureMinter(address(this), type(uint256).max);

        uint256 amount = 42069;
        mintUSDC(amount);
        require(usdc.balanceOf(address(this)) == amount);
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
        // set up circle contracts (transferring ownership to address(this), etc)
        setupUSDC();

        // set up wormhole simulator
        setupWormhole();

        // now our contract
        setupCircleRelayer();
    }

    /// @notice Converts 20-byte addresses to bytes32 (zero-left-padded)
    function addressToBytes32(address address_) public pure returns (bytes32) {
        return bytes32(uint256(uint160(address_)));
    }

    function testPlaceHolder() public pure {
        return;
    }
}
