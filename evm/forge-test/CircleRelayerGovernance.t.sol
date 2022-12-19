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
import {IUSDC} from "../src/interfaces/IUSDC.sol";
import {ICircleRelayer} from "../src/interfaces/ICircleRelayer.sol";

import {CircleRelayerStructs} from "../src/circle-relayer/CircleRelayerStructs.sol";
import {CircleRelayerSetup} from "../src/circle-relayer/CircleRelayerSetup.sol";
import {CircleRelayerImplementation} from "../src/circle-relayer/CircleRelayerImplementation.sol";
import {CircleRelayerProxy} from "../src/circle-relayer/CircleRelayerProxy.sol";

/**
 * @title A Test Suite for the Circle-Relayer Smart Contracts
 */
contract CircleRelayerGovernanceTest is Test, ForgeHelpers {
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
        vm.startPrank(usdc.masterMinter());
        usdc.configureMinter(address(this), type(uint256).max);
        vm.stopPrank();

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

    /**
     * @notice This test confirms that the owner can correctly upgrade the
     * contract impementation.
     */
    function testUpgrade() public {
        // hashed slot of implementation
        bytes32 implementationSlot =
            0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;

        // grap current implementation
        bytes32 implementationBefore = vm.load(
            address(relayer),
            implementationSlot
        );

         // deploy implementation and upgrade the contract
        CircleRelayerImplementation implementation =
            new CircleRelayerImplementation();

        // upgrade the contract and fetch the new implementation slot
        relayer.upgrade(relayer.chainId(), address(implementation));
        bytes32 implementationAfter = vm.load(
            address(relayer),
            implementationSlot
        );

        // confrim state changes
        assertEq(implementationAfter != implementationBefore, true);
        assertEq(
            implementationAfter == addressToBytes32(address(implementation)),
            true
        );

        // confirm the new implementation is initialized
        assertEq(relayer.isInitialized(address(implementation)), true);
    }

    /**
     * @notice This test confirms that the owner cannot upgrade the
     * contract impementation to the wrong chain.
     */
    function testUpgradeWrongChain() public {
        uint16 wrongChainId_ = 69;

        // deploy implementation and upgrade the contract
        CircleRelayerImplementation implementation =
            new CircleRelayerImplementation();

        // expect the upgrade call to fail
        vm.expectRevert("wrong chain");
        relayer.upgrade(wrongChainId_, address(implementation));
    }

    /**
     * @notice This test confirms that ONLY the owner can upgrade the contract.
     */
    function testUpgradeOnlyOwner() public {
        // deploy implementation and upgrade the contract
        CircleRelayerImplementation implementation =
            new CircleRelayerImplementation();

        // prank the caller address to something different than the owner's
        vm.startPrank(address(wormholeSimulator));

        // expect the upgrade call to fail
        bytes memory encodedSignature = abi.encodeWithSignature(
            "upgrade(uint16,address)",
            relayer.chainId(),
            address(implementation)
        );
        expectRevert(
            address(relayer),
            encodedSignature,
            "caller not the owner"
        );

        vm.stopPrank();
    }

    /**
     * @notice This test confirms that the only cannot update the
     * implementation to the zero address.
     */
    function testUpgradeOnlyInvalidImplementation() public {
        // deploy implementation and upgrade the contract
        address implementation = address(0);

        // expect the upgrade call to fail
        bytes memory encodedSignature = abi.encodeWithSignature(
            "upgrade(uint16,address)",
            relayer.chainId(),
            implementation
        );
        expectRevert(
            address(relayer),
            encodedSignature,
            "invalid implementation"
        );

        vm.stopPrank();
    }

    /**
     * @notice This test confirms that the owner can correctly register a foreign
     * CircleRelayer contract.
     */
    function testRegisterContract(
        uint16 chainId_,
        bytes32 circleRelayerContract
    ) public {
        vm.assume(circleRelayerContract != bytes32(0));
        vm.assume(chainId_ != 0 && chainId_ != relayer.chainId());

        // register the contract
        relayer.registerContract(chainId_, circleRelayerContract);

        // verify that the state was updated correctly
        bytes32 registeredContract = relayer.getRegisteredContract(
            chainId_
        );
        assertEq(registeredContract, circleRelayerContract);
    }

    /// @notice This test confirms that the owner can not register address(0)
    function testRegisterContractZeroAddress() public {
        uint16 chainId_ = 42;
        bytes32 zeroAddress = addressToBytes32(address(0));

        // expect the registerContract call to revert
        vm.expectRevert("contractAddress cannot equal bytes32(0)");
        relayer.registerContract(chainId_, zeroAddress);
    }

    /**
     * @notice This test confirms that the owner can not register a foreign
     * CircleRelayer contract with the same chainId.
     */
    function testRegisterContractThisChainId() public {
        bytes32 circleRelayerContract = addressToBytes32(address(this));

        // expect the registerContract call to fail
        bytes memory encodedSignature = abi.encodeWithSignature(
            "registerContract(uint16,bytes32)",
            relayer.chainId(),
            circleRelayerContract
        );
        expectRevert(
            address(relayer),
            encodedSignature,
            "chainId_ cannot equal 0 or this chainId"
        );
    }

    /**
     * @notice This test confirms that the owner can not register a foreign
     * CircleRelayer contract with a chainId of zero.
     */
    function testRegisterContractChainIdZero() public {
        uint16 chainId_ = 0;
        bytes32 circleRelayerContract = addressToBytes32(address(this));

        // expect the registerContract call to revert
        vm.expectRevert("chainId_ cannot equal 0 or this chainId");
        relayer.registerContract(chainId_, circleRelayerContract);
    }

    /**
     * @notice This test confirms that ONLY the owner can register a foreign
     * CircleRelayer contract.
     */
    function testRegisterContractOwnerOnly() public {
        uint16 chainId_ = 42;
        bytes32 circleRelayerContract = addressToBytes32(address(this));

        // prank the caller address to something different than the owner's
        vm.startPrank(address(wormholeSimulator));

        // expect the registerContract call to revert
        vm.expectRevert("caller not the owner");
        relayer.registerContract(chainId_, circleRelayerContract);

        vm.stopPrank();
    }

    /**
     * @notice This test confirms that the owner can update the relayer fee
     * for any registered relayer contract.
     */
    function testUpdateRelayerFee(uint16 chainId_, uint256 relayerFee) public {
        vm.assume(chainId_ != 0 && chainId_ != relayer.chainId());

        // register random target contract
        relayer.registerContract(chainId_, addressToBytes32(address(this)));

        // update the relayer fee for USDC
        relayer.updateRelayerFee(
            chainId_,
            address(usdc),
            relayerFee
        );

        // confirm state changes
        assertEq(relayer.relayerFee(chainId_, address(usdc)), relayerFee);
    }

    /**
     * @notice This test confirms that the owner can only update the relayerFee
     * for a registered relayer contract or for its own chainId.
     */
    function testUpdateRelayerFeeContractNotRegistered(uint16 chainId_) public {
        if (chainId_ != relayer.chainId()) {
            // expect revert
            vm.expectRevert("contract doesn't exist");
        }

        // Attempt to update relayer fee with out registering a contract for
        // the chainId.
        relayer.updateRelayerFee(
            chainId_,
            address(usdc),
            1e4
        );
    }

    /**
     * @notice This test confirms that the owner can not update the relayer
     * fee for a token that is not accepted by the Circle Integration contract.
     */
    function testUpdateRelayerFeeInvalidToken() public {
        address invalidTokenAddress = address(this);
        uint256 relayerFee = 1e8;

        // expect the updateRelayerFee method call to fail
        bytes memory encodedSignature = abi.encodeWithSignature(
            "updateRelayerFee(uint16,address,uint256)",
            relayer.chainId(),
            invalidTokenAddress,
            relayerFee
        );
        expectRevert(
            address(relayer),
            encodedSignature,
            "token not accepted"
        );
    }

    /**
     * @notice This test confirms that ONLY the owner can update the relayer
     * fee for registered relayer contracts.
     */
    function testUpdateRelayerFeeOwnerOnly() public {
        uint16 chainId_ = 42069;
        uint256 relayerFee = 1e8;

        // register random target contract
        relayer.registerContract(chainId_, addressToBytes32(address(this)));

        // prank the caller address to something different than the owner's
        vm.startPrank(address(wormholeSimulator));

        // expect the updateRelayerFee call to revert
        vm.expectRevert("caller not the owner");
        relayer.updateRelayerFee(
            chainId_,
            address(usdc),
            relayerFee
        );

        vm.stopPrank();
    }

    /**
     * @notice This test confirms that the owner can update the native swap
     * rate for accepted tokens.
     */
    function testUpdateNativeSwapRate(uint256 swapRate) public {
        vm.assume(swapRate > 0);

        // cache token address
        address token = address(usdc);

        // update the native to USDC swap rate
        relayer.updateNativeSwapRate(
            relayer.chainId(),
            token,
            swapRate
        );

        // confirm state changes
        assertEq(relayer.nativeSwapRate(token), swapRate);
    }

    /**
     * @notice This test confirms that the owner can not update the native
     * swap rate to zero.
     */
    function testUpdateNativeSwapRateZeroRate() public {
        // cache token address
        address token = address(usdc);
        uint256 swapRate = 0;

        // expect the updateNativeSwapRate call to revert
        bytes memory encodedSignature = abi.encodeWithSignature(
            "updateNativeSwapRate(uint16,address,uint256)",
            relayer.chainId(),
            token,
            swapRate
        );
        expectRevert(
            address(relayer),
            encodedSignature,
            "swap rate must be nonzero"
        );
    }

    /**
     * @notice This test confirms that the owner can not update the native
     * swap rate for a token not accepted by the Circle Integration contract.
     */
    function testUpdateNativeSwapRateInvalidToken() public {
        // cache token address
        address token = address(0);
        uint256 swapRate = 1e10;

        // expect the updateNativeSwapRate call to revert
        bytes memory encodedSignature = abi.encodeWithSignature(
            "updateNativeSwapRate(uint16,address,uint256)",
            relayer.chainId(),
            token,
            swapRate
        );
        expectRevert(
            address(relayer),
            encodedSignature,
            "token not accepted"
        );
    }

    /**
     * @notice This test confirms that ONLY the owner can update the native
     * swap rate.
     */
    function testUpdateNativeSwapRateOwnerOnly() public {
        address token = address(usdc);
        uint256 swapRate = 1e10;

        // prank the caller address to something different than the owner's
        vm.startPrank(address(wormholeSimulator));

        // expect the updateNativeSwapRate call to revert
        bytes memory encodedSignature = abi.encodeWithSignature(
            "updateNativeSwapRate(uint16,address,uint256)",
            relayer.chainId(),
            token,
            swapRate
        );
        expectRevert(
            address(relayer),
            encodedSignature,
            "caller not the owner"
        );

        vm.stopPrank();
    }

    /**
     * @notice This test confirms that the owner cannot update the native
     * swap rate for the wrong chain.
     */
    function testUpdateNativeSwapRateWrongChain(uint16 chainId_) public {
        vm.assume(chainId_ != relayer.chainId());

        address token = address(usdc);
        uint256 swapRate = 1e10;

        // expect the updateNativeSwapRate call to revert
        vm.expectRevert("wrong chain");
        relayer.updateNativeSwapRate(
            chainId_,
            token,
            swapRate
        );
    }

    /**
     * @notice This test confirms that the owner can update the native swap
     * rate precision.
     */
    function testUpdateNativeSwapRatePrecision(
        uint256 nativeSwapRatePrecision_
    ) public {
        vm.assume(nativeSwapRatePrecision_ > 0);

        // update the native swap rate precision
        relayer.updateNativeSwapRatePrecision(
            relayer.chainId(),
            nativeSwapRatePrecision_
        );

        // confirm state changes
        assertEq(relayer.nativeSwapRatePrecision(), nativeSwapRatePrecision_);
    }

    /**
     * @notice This test confirms that the owner cannot update the native swap
     * rate precision to zero.
     */
    function testUpdateNativeSwapRatePrecisionZeroAmount() public {
        uint256 nativeSwapRatePrecision_ = 0;

        // expect the updateNativeSwapRatePrecision to revert
        bytes memory encodedSignature = abi.encodeWithSignature(
            "updateNativeSwapRatePrecision(uint16,uint256)",
            relayer.chainId(),
            nativeSwapRatePrecision_
        );
        expectRevert(
            address(relayer),
            encodedSignature,
            "precision must be > 0"
        );
    }

    /**
     * @notice This test confirms that ONLY the owner can update the native
     * swap rate precision.
     */
    function testUpdateNativeSwapRatePrecisionOwnerOnly() public {
        uint256 nativeSwapRatePrecision_ = 1e10;

        // prank the caller address to something different than the owner's
        vm.startPrank(address(wormholeSimulator));

        // expect the updateNativeSwapRatePrecision call to revert
        bytes memory encodedSignature = abi.encodeWithSignature(
            "updateNativeSwapRatePrecision(uint16,uint256)",
            relayer.chainId(),
            nativeSwapRatePrecision_
        );
        expectRevert(
            address(relayer),
            encodedSignature,
            "caller not the owner"
        );

        vm.stopPrank();
    }

    /**
     * @notice This test confirms that owner cannot update the native
     * swap rate precision for the wrong chain.
     */
    function testUpdateNativeSwapRatePrecisionWrongChain(uint16 chainId_) public {
        vm.assume(chainId_ != relayer.chainId());

        uint256 nativeSwapRatePrecision_ = 1e10;

        // expect the updateNativeSwapRate call to revert
        vm.expectRevert("wrong chain");
        relayer.updateNativeSwapRatePrecision(
            chainId_,
            nativeSwapRatePrecision_
        );
    }

    /**
     * @notice This test confirms that the owner can update the max native
     * swap amount.
     */
    function testUpdateMaxSwapAmount(uint256 maxAmount) public {
        // cache token address
        address token = address(usdc);

        // update the native to USDC swap rate
        relayer.updateMaxSwapAmount(
            relayer.chainId(),
            token,
            maxAmount
        );

        // confirm state changes
        assertEq(relayer.maxSwapAmount(token), maxAmount);
    }

    /**
     * @notice This test confirms that the owner can not update the max
     * native swap amount for tokens not accepted by the Circle Integration
     * contract.
     */
    function testUpdateMaxSwapAmountInvalidToken() public {
        // cache token address
        address token = address(0);
        uint256 maxAmount = 1e10;

        // expect the updateMaxSwapAmount call to revert
        bytes memory encodedSignature = abi.encodeWithSignature(
            "updateMaxSwapAmount(uint16,address,uint256)",
            relayer.chainId(),
            token,
            maxAmount
        );
        expectRevert(
            address(relayer),
            encodedSignature,
            "token not accepted"
        );
    }

    /**
     * @notice This test confirms that ONLY the owner can update the native
     * max swap amount.
     */
    function testUpdateMaxSwapAmountOwnerOnly() public {
        address token = address(usdc);
        uint256 maxAmount = 1e10;

        // prank the caller address to something different than the owner's
        vm.startPrank(address(wormholeSimulator));

        // expect the updateMaxSwapAmount call to revert
        bytes memory encodedSignature = abi.encodeWithSignature(
            "updateMaxSwapAmount(uint16,address,uint256)",
            relayer.chainId(),
            token,
            maxAmount
        );
        expectRevert(
            address(relayer),
            encodedSignature,
            "caller not the owner"
        );

        vm.stopPrank();
    }

    /**
     * @notice This test confirms that owner cannot update the max swap amount
     * for the wrong chain.
     */
    function testUpdateMaxSwapAmountWrongChain(uint16 chainId_) public {
        vm.assume(chainId_ != relayer.chainId());

        address token = address(usdc);
        uint256 maxAmount = 1e10;

        // expect the updateNativeSwapRate call to revert
        vm.expectRevert("wrong chain");
        relayer.updateMaxSwapAmount(
            chainId_,
            token,
            maxAmount
        );
    }

    /**
     * @notice This test confirms that the owner can submit a request to
     * transfer ownership of the contract.
     */
    function testSubmitOwnershipTransferRequest(address newOwner) public {
        vm.assume(newOwner != address(0));

        // call submitOwnershipTransferRequest
        relayer.submitOwnershipTransferRequest(relayer.chainId(), newOwner);

        // confirm state changes
        assertEq(relayer.pendingOwner(), newOwner);
    }

    /**
     * @notice This test confirms that the owner cannot submit a request to
     * transfer ownership of the contract on the wrong chain.
     */
    function testSubmitOwnershipTransferRequestWrongChain(uint16 chainId_) public {
        vm.assume(chainId_ != relayer.chainId());

        // expect the submitOwnershipTransferRequest call to revert
        vm.expectRevert("wrong chain");
        relayer.submitOwnershipTransferRequest(chainId_, address(this));
    }

    /**
     * @notice This test confirms that the owner cannot submit a request to
     * transfer ownership of the contract to address(0).
     */
    function testSubmitOwnershipTransferRequestZeroAddress() public {
        address zeroAddress = address(0);

        // expect the submitOwnershipTransferRequest call to revert
        bytes memory encodedSignature = abi.encodeWithSignature(
            "submitOwnershipTransferRequest(uint16,address)",
            relayer.chainId(),
            zeroAddress
        );
        expectRevert(
            address(relayer),
            encodedSignature,
            "newOwner cannot equal address(0)"
        );
    }

    /**
     * @notice This test confirms that ONLY the owner can submit a request
     * to transfer ownership of the contract.
     */
    function testSubmitOwnershipTransferRequestOwnerOnly() public {
        address newOwner = address(this);

        // prank the caller address to something different than the owner's
        vm.startPrank(address(usdc));

        // expect the submitOwnershipTransferRequest call to revert
        bytes memory encodedSignature = abi.encodeWithSignature(
            "submitOwnershipTransferRequest(uint16,address)",
            relayer.chainId(),
            newOwner
        );
        expectRevert(
            address(relayer),
            encodedSignature,
            "caller not the owner"
        );

        vm.stopPrank();
    }

    /**
     * This test confirms that the pending owner can confirm an ownership
     * transfer request from their wallet.
     */
    function testConfirmOwnershipTransferRequest(address newOwner) public {
        vm.assume(newOwner != address(0));

        // verify pendingOwner and owner state variables
        assertEq(relayer.pendingOwner(), address(0));
        assertEq(relayer.owner(), address(this));

        // submit ownership transfer request
        relayer.submitOwnershipTransferRequest(relayer.chainId(), newOwner);

        // verify the pendingOwner state variable
        assertEq(relayer.pendingOwner(), newOwner);

        // Invoke the confirmOwnershipTransferRequest method from the
        // new owners wallet.
        vm.prank(newOwner);
        relayer.confirmOwnershipTransferRequest();

        // Verify the ownership change, and that the pendingOwner
        // state variable has been set to address(0).
        assertEq(relayer.owner(), newOwner);
        assertEq(relayer.pendingOwner(), address(0));
    }

    /**
     * @notice This test confirms that only the pending owner can confirm an
     * ownership transfer request.
     */

     function testConfirmOwnershipTransferRequestNotPendingOwner(
        address pendingOwner
    ) public {
        vm.assume(
            pendingOwner != address(0) &&
            pendingOwner != address(this)
        );

        // set the pending owner and confirm the pending owner state variable
        relayer.submitOwnershipTransferRequest(relayer.chainId(), pendingOwner);
        assertEq(relayer.pendingOwner(), pendingOwner);

        // Attempt to confirm the ownership transfer request from a wallet that is
        // not the pending owner's.
        vm.startPrank(address(this));
        vm.expectRevert("caller must be pendingOwner");
        relayer.confirmOwnershipTransferRequest();

        vm.stopPrank();
    }

    /**
     * @notice This test confirms that the owner can update the wormhole message
     * finality.
     */
    function testUpdateWormholeFinality(uint8 wormholeFinality_) public {
        vm.assume(wormholeFinality_ > 0);

        // update the wormhole finality
        relayer.updateWormholeFinality(relayer.chainId(), wormholeFinality_);

        // confirm state changes
        assertEq(relayer.wormholeFinality(), wormholeFinality_);
    }

    /**
     * @notice This test confirms that the owner can only update the wormhole
     * message finality with the correct chainId.
     */
    function testUpdateWormholeFinalityWrongChain(uint16 chainId_) public {
        vm.assume(chainId_ > 0 && chainId_ != relayer.chainId());

        uint8 wormholeFinality_ = 69;

        // expect the updateWormholeFinality call to revert
        vm.expectRevert("wrong chain");
        relayer.updateWormholeFinality(chainId_, wormholeFinality_);
    }

    /**
     * @notice This test confirms that the owner can only update the wormhole
     * message finality to a value greater than zero.
     */
    function testUpdateWormholeFinalityZeroFinality() public {
        uint8 wormholeFinality_ = 0;

        // expect the updateWormholeFinality call to revert
        bytes memory encodedSignature = abi.encodeWithSignature(
            "updateWormholeFinality(uint16,uint8)",
            relayer.chainId(),
            wormholeFinality_
        );
        expectRevert(
            address(relayer),
            encodedSignature,
            "invalid wormhole finality"
        );
    }

    /**
     * @notice This test confirms that ONLY the owner can update the wormhole
     * finality.
     */
    function testUpdateWormholeFinalityOwnerOnly() public {
        uint8 wormholeFinality_ = 69;

        // prank the caller address to something different than the owner's
        vm.startPrank(address(usdc));

        // expect the updateWormholeFinality call to revert
        bytes memory encodedSignature = abi.encodeWithSignature(
            "updateWormholeFinality(uint16,uint8)",
            relayer.chainId(),
            wormholeFinality_
        );
        expectRevert(
            address(relayer),
            encodedSignature,
            "caller not the owner"
        );

        vm.stopPrank();
    }
}
