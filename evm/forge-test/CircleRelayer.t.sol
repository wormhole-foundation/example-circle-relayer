// SPDX-License-Identifier: Apache 2
pragma solidity ^0.8.13;

import "forge-std/Test.sol";
import "forge-std/console.sol";

import {BytesLib} from "../src/libraries/BytesLib.sol";
import {WormholeSimulator} from "wormhole-solidity/WormholeSimulator.sol";
import {CircleSimulator} from "wormhole-solidity/CircleSimulator.sol";
import {ForgeHelpers} from "wormhole-solidity/ForgeHelpers.sol";

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {IWormhole} from "../src/interfaces/IWormhole.sol";
import {IUSDC} from "../src/interfaces/IUSDC.sol";
import {ICircleRelayer} from "../src/interfaces/ICircleRelayer.sol";
import {IMessageTransmitter} from "../src/interfaces/IMessageTransmitter.sol";
import {ICircleBridge} from "../src/interfaces/ICircleBridge.sol";
import {ICircleIntegration} from "../src/interfaces/ICircleIntegration.sol";

import {CircleRelayerStructs} from "../src/circle-relayer/CircleRelayerStructs.sol";
import {CircleRelayerSetup} from "../src/circle-relayer/CircleRelayerSetup.sol";
import {CircleRelayerImplementation} from "../src/circle-relayer/CircleRelayerImplementation.sol";
import {CircleRelayerProxy} from "../src/circle-relayer/CircleRelayerProxy.sol";

interface IWETH is IERC20 {
    function deposit() external payable;
    function withdraw(uint amount) external;
}

/**
 * @title A Test Suite for the Circle-Relayer Smart Contracts
 */
contract CircleRelayerTest is Test, ForgeHelpers {
    using BytesLib for bytes;

    // USDC
    IUSDC usdc;
    address foreignUsdcAddress;

    // target chain info
    uint16 targetChain;
    bytes32 targetContract;

    // dependencies
    WormholeSimulator wormholeSimulator;
    CircleSimulator circleSimulator;
    IWormhole wormhole;

    // Circle relayer contract
    ICircleRelayer relayer;

    // max burn amount for USDC Circle bridge
    uint256 constant MAX_BURN_AMOUNT = 1e12;

    // relayer and recipient wallets (random wallet addresses)
    address relayerWallet = vm.envAddress(
        "TESTING_RELAYER_WALLET"
    );
    address recipientWallet = vm.envAddress(
        "TESTING_RECIPIENT_WALLET"
    );

    // Circle Integration contract
    ICircleIntegration integration;
    address foreignCircleIntegrationAddress = vm.envAddress(
        "TESTING_TARGET_CIRCLE_INTEGRATION_ADDRESS"
    );

    // Circle Bridge addresses
    address ethCircleBridge = vm.envAddress(
        "TESTING_CIRCLE_BRIDGE_ADDRESS"
    );
    address avaxCircleBridge = vm.envAddress(
        "TESTING_TARGET_CIRCLE_BRIDGE_ADDRESS"
    );

    // used to compute balance changes before/after redeeming token transfers
    struct Balances {
        uint256 recipientBefore;
        uint256 recipientAfter;
        uint256 relayerBefore;
        uint256 relayerAfter;
    }

    function setupWormhole() public {
        // set up this chain's Wormhole
        wormholeSimulator = new WormholeSimulator(
            vm.envAddress("TESTING_WORMHOLE_ADDRESS"),
            uint256(vm.envBytes32("TESTING_DEVNET_GUARDIAN")));
        wormhole = wormholeSimulator.wormhole();
    }

    function setupCircleSimulator() public {
        // instantiate USDCs
        usdc = IUSDC(vm.envAddress("TESTING_USDC_TOKEN_ADDRESS"));
        foreignUsdcAddress = vm.envAddress("TESTING_FOREIGN_USDC_TOKEN_ADDRESS");

        // set up this chain's Circle Bridge
        circleSimulator = new CircleSimulator(
            uint256(vm.envBytes32("TESTING_DEVNET_GUARDIAN")),
            vm.envAddress("TESTING_CIRCLE_TRANSMITTER_ADDRESS"),
            vm.envAddress("TESTING_USDC_TOKEN_ADDRESS")
        );
        circleSimulator.setupCircleAttester();

        // confirm that the circle simulator will mint USDC
        uint256 amount = 42069;
        circleSimulator.mintUSDC(amount);
        require(usdc.balanceOf(address(this)) == amount);
    }

    function setupCircleIntegration() public {
        integration = ICircleIntegration(
            vm.envAddress("TESTING_CIRCLE_INTEGRATION_ADDRESS")
        );
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

        // set the initial relayer fee to 1 USDC
        relayer.updateRelayerFee(relayer.chainId(), address(usdc), 1e6);

        // set the native swap rate to 0.01 avax
        relayer.updateNativeSwapRate(
            relayer.chainId(),
            address(usdc),
            100 * relayer.nativeSwapRatePrecision()
        );

        // set the max swap amount
        relayer.updateMaxNativeSwapAmount(relayer.chainId(), address(usdc), 1e17);

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

        // set target chain parameters
        targetChain = 6; // avax
        targetContract = addressToBytes32(address(this)); // random address
    }

    function setUp() public {
        setupCircleSimulator();
        setupWormhole();
        setupCircleIntegration();
        setupCircleRelayer();
    }

    /**
     * @notice This tests confirms that the native swap amount calculation does not
     * revert when the amount input is zero.
     */
    function testCalculateNativeSwapAmountZeroAmount(uint256 nativeSwapRate) public {
        vm.assume(nativeSwapRate > 0);

        address token = address(usdc);
        uint256 toNativeAmount = 0;

        // need to set the native swap rate for USDC
        relayer.updateNativeSwapRate(relayer.chainId(), token, nativeSwapRate);

        // compute the native amount expect
        uint256 nativeAmount = relayer.calculateNativeSwapAmountOut(token, toNativeAmount);

        assertEq(nativeAmount, 0);
    }

    /**
     * @notice This tests confirms that the relayer fee calculation reverts
     * when the native swap rate is set to zero (which means it hasn't been set).
     */
    function testCalculateNativeSwapAmountSwapRateNotSet(
        address token,
        uint256 toNativeTokenAmount
    ) public {
        vm.assume(toNativeTokenAmount > 0);
        vm.assume(token != address(0) && token != address(usdc));

        // call should revert
        vm.expectRevert("swap rate not set");
        relayer.calculateNativeSwapAmountOut(
            token,
            toNativeTokenAmount
        );
    }

    /**
     * @notice This tests confirms that the max swap amount calculation reverts
     * when the native swap rate is set to zero (which means it hasn't been set).
     */
    function testCalculateMaxSwapAmountSwapRateNotSet(
        address token,
        uint256 toNativeTokenAmount
    ) public {
        vm.assume(toNativeTokenAmount > 0);
        vm.assume(token != address(0) && token != address(usdc));

        // call should revert
        vm.expectRevert("swap rate not set");
        relayer.calculateMaxSwapAmountIn(
            token
        );
    }

    /**
     * @notice This test confirms that the `transferTokensWithRelay` method correctly
     * burns USDC and sends TransferTokensWithRelay Wormhole message.
     */
    function testTransferTokensWithRelay(
        uint256 amount,
        uint256 toNativeTokenAmount,
        bytes32 targetRecipientWallet
    ) public {
        vm.assume(amount > 0 && amount < MAX_BURN_AMOUNT);
        vm.assume(targetRecipientWallet != bytes32(0));
        vm.assume(amount > toNativeTokenAmount);

        // register the target contract
        relayer.registerContract(targetChain, targetContract);

        // mint usdc to address(this)
        circleSimulator.mintUSDC(amount);

        // approve the circle relayer to spend tokesn
        SafeERC20.safeApprove(
            IERC20(address(usdc)),
            address(relayer),
            amount
        );

        // start listening to events
        vm.recordLogs();

        // save balance of this contract before transferring the tokens
        uint256 balanceBefore = getBalance(address(usdc), address(this));
        uint256 relayerBalanceBefore = getBalance(address(usdc), address(relayer));
        uint256 usdcSupplyBefore = usdc.totalSupply();

        // initiate a transfer with relay
        relayer.transferTokensWithRelay(
            address(usdc),
            amount,
            toNativeTokenAmount,
            targetChain,
            targetRecipientWallet
        );

        // fetch recorded logs
        Vm.Log[] memory logs = vm.getRecordedLogs();

        // find published wormhole messages in logs
        Vm.Log[] memory wormholeMessages =
            wormholeSimulator.fetchWormholeMessageFromLog(logs, 1);
        assertEq(wormholeMessages.length, 1);

        // simulate signing the Wormhole message
        // NOTE: in the wormhole-sdk, signed Wormhole messages are referred to as signed VAAs
        bytes memory encodedMessage = wormholeSimulator.fetchSignedMessageFromLogs(
            wormholeMessages[0],
            relayer.chainId(),
            address(relayer)
        );

        // parse and verify the message
        (
            IWormhole.VM memory wormholeMessage,
            bool valid,
            string memory reason
        ) = wormhole.parseAndVerifyVM(encodedMessage);
        require(valid, reason);

        /**
         * Parse the encoded payload into the Circle Integration DepositWithPayload
         * struct. Then, parse the additional payload into the TransferTokensWithRelay
         * struct and validate values.
         */
        ICircleIntegration.DepositWithPayload memory depositWithPayload =
            integration.decodeDepositWithPayload(wormholeMessage.payload);
        ICircleRelayer.TransferTokensWithRelay memory transfer =
            relayer.decodeTransferTokensWithRelay(depositWithPayload.payload);

        // validate values
        assertEq(
            balanceBefore - getBalance(address(usdc), address(this)),
            amount
        );
        assertEq(transfer.payloadId, 1);
        assertEq(
            transfer.targetRelayerFee,
            relayer.relayerFee(targetChain, address(usdc))
        );
        assertEq(transfer.toNativeTokenAmount, toNativeTokenAmount);
        assertEq(transfer.targetRecipientWallet, targetRecipientWallet);

        // confirm that the relayer contract didn't eat the tokens
        assertEq(
            getBalance(address(usdc), address(relayer)),
            relayerBalanceBefore
        );

        // confirm that the usdc was burned
        assertEq(
            usdc.totalSupply(), usdcSupplyBefore - amount
        );
    }

    /**
     * @notice This test confirms that the `transferTokensWithRelay` method reverts
     * when the token is not registered. Need to test this method with a real ERC20
     * token to test the correct require statement.
     */
    function testTransferTokensWithRelayInvalidToken() public {
        address token = vm.envAddress("WETH_ADDRESS");

        uint256 amount = 1e18;
        uint256 toNativeTokenAmount = 1e6;

        // wrap some eth
        IWETH(token).deposit{value: amount}();

        // register the target contract
        relayer.registerContract(targetChain, targetContract);

        // mint usdc to address(this)
        circleSimulator.mintUSDC(amount);

        // approve the circle relayer to spend tokesn
        SafeERC20.safeApprove(
            IERC20(token),
            address(relayer),
            amount
        );

        // the transferTokensWithRelay call should revert
        vm.expectRevert("token not accepted");
        relayer.transferTokensWithRelay(
            token,
            amount,
            toNativeTokenAmount,
            targetChain,
            addressToBytes32(address(this))
        );
    }

    /**
     * @notice This test confirms that the `transferTokensWithRelay` method reverts
     * when the target chain is not registered.
     */
    function testTransferTokensWithRelayInvalidTargetChain(
        uint16 targetChain_
    ) public {
        vm.assume(targetChain_ != relayer.chainId() && targetChain_ != 0);
        uint256 amount = 1e10;
        uint256 toNativeTokenAmount = 1e6;

        // mint usdc to address(this)
        circleSimulator.mintUSDC(amount);

        // approve the circle relayer to spend tokesn
        SafeERC20.safeApprove(
            IERC20(address(usdc)),
            address(relayer),
            amount
        );

        // the transferTokensWithRelay call should revert
        vm.expectRevert("CIRCLE-RELAYER: target not registered");
        relayer.transferTokensWithRelay(
            address(usdc),
            amount,
            toNativeTokenAmount,
            targetChain_,
            addressToBytes32(address(this))
        );
    }

    /**
     * @notice This test confirms that the `transferTokensWithRelay` method reverts
     * when the amount is insufficient.
     */
    function testTransferTokensWithRelayInsufficientAmount(
        uint256 amount,
        uint256 toNativeTokenAmount
    ) public {
        vm.assume(amount > 0 && amount < usdc.totalSupply());
        vm.assume(
            amount < toNativeTokenAmount + relayer.relayerFee(
                targetChain, address(usdc)
            )
        );

        // register the target contract
        relayer.registerContract(targetChain, targetContract);

        // mint usdc to address(this)
        circleSimulator.mintUSDC(amount);

        // approve the circle relayer to spend tokesn
        SafeERC20.safeApprove(
            IERC20(address(usdc)),
            address(relayer),
            amount
        );

        // the transferTokensWithRelay call should revert
        vm.expectRevert("insufficient amountReceived");
        relayer.transferTokensWithRelay(
            address(usdc),
            amount,
            toNativeTokenAmount,
            targetChain,
            addressToBytes32(address(this))
        );
    }

    /**
     * @notice This test confirms that the `transferTokensWithRelay` method reverts
     * when the amount is zero.
     */
    function testTransferTokensWithRelayZeroAmount(
        uint256 amount,
        uint256 toNativeTokenAmount
    ) public {
        vm.assume(amount == 0);
        vm.assume(
            amount < toNativeTokenAmount + relayer.relayerFee(
                targetChain, address(usdc)
            )
        );

        // register the target contract
        relayer.registerContract(targetChain, targetContract);

        // approve the circle relayer to spend tokesn
        SafeERC20.safeApprove(
            IERC20(address(usdc)),
            address(relayer),
            amount
        );

        // the transferTokensWithRelay call should revert
        vm.expectRevert("amount must be > 0");
        relayer.transferTokensWithRelay(
            address(usdc),
            amount,
            toNativeTokenAmount,
            targetChain,
            addressToBytes32(address(this))
        );
    }

    /**
     * @notice This test confirms that the `transferTokensWithRelay` method reverts
     * when the token address is address(0).
     */
    function testTransferTokensWithRelayZeroAddress(
        uint256 amount,
        uint256 toNativeTokenAmount
    ) public {
        vm.assume(amount > 0 && amount < usdc.totalSupply());
        vm.assume(
            amount < toNativeTokenAmount + relayer.relayerFee(
                targetChain, address(usdc)
            )
        );

        // register the target contract
        relayer.registerContract(targetChain, targetContract);

        // approve the circle relayer to spend tokesn
        SafeERC20.safeApprove(
            IERC20(address(usdc)),
            address(relayer),
            amount
        );

        // the transferTokensWithRelay call should revert
        vm.expectRevert("token cannot equal address(0)");
        relayer.transferTokensWithRelay(
            address(0),
            amount,
            toNativeTokenAmount,
            targetChain,
            addressToBytes32(address(this))
        );
    }

    /**
     * @notice This test confirms that the `transferTokensWithRelay` method reverts
     * when the targetRecipientWallet address is bytes32(0).
     */
    function testTransferTokensWithRelayInvalidRecipientAddress(
        uint256 amount,
        uint256 toNativeTokenAmount
    ) public {
        vm.assume(amount > 0 && amount < usdc.totalSupply());
        vm.assume(
            amount < toNativeTokenAmount + relayer.relayerFee(
                targetChain, address(usdc)
            )
        );

        // register the target contract
        relayer.registerContract(targetChain, targetContract);

        // approve the circle relayer to spend tokesn
        SafeERC20.safeApprove(
            IERC20(address(usdc)),
            address(relayer),
            amount
        );

        // the transferTokensWithRelay call should revert
        vm.expectRevert("invalid target recipient");
        relayer.transferTokensWithRelay(
            address(usdc),
            amount,
            toNativeTokenAmount,
            targetChain,
            bytes32(0)
        );
    }

    function createDepositWithPayloadMessage(
        uint16 emitterChainId,
        bytes32 emitterAddress,
        ICircleIntegration.DepositWithPayload memory deposit
    ) internal view returns (bytes memory signedTransfer) {
        // construct `DepositWithPayload` Wormhole message
        IWormhole.VM memory vm;

        // set the vm values inline
        vm.version = uint8(1);
        vm.timestamp = uint32(block.timestamp);
        vm.emitterChainId = emitterChainId;
        vm.emitterAddress = emitterAddress;

        // fetch sequence on this chain as a place holder
        vm.sequence = wormhole.nextSequence(
            address(uint160(uint256(emitterAddress)))
        );
        vm.consistencyLevel = relayer.wormholeFinality();
        vm.payload = integration.encodeDepositWithPayload(deposit);

        // encode the bservation
        signedTransfer = wormholeSimulator.encodeAndSignMessage(vm);

    }

    function createCircleMessageFromEth(
        ICircleIntegration.DepositWithPayload memory deposit
    ) internal view returns (bytes memory) {
         // create Circle Message coming from Avalanche (source chain)
        CircleSimulator.CircleMessage memory circleMessage;

        // version
        circleMessage.version = 0;
        circleMessage.sourceDomain = deposit.sourceDomain;
        circleMessage.targetDomain = deposit.targetDomain;
        circleMessage.nonce = deposit.nonce;
        circleMessage.sourceCircle = addressToBytes32(avaxCircleBridge);
        circleMessage.targetCircle = addressToBytes32(ethCircleBridge);
        circleMessage.targetCaller = addressToBytes32(address(integration));
        circleMessage.token = addressToBytes32(foreignUsdcAddress);
        circleMessage.mintRecipient = deposit.mintRecipient;
        circleMessage.amount = deposit.amount;
        circleMessage.transferInitiator = addressToBytes32(
            foreignCircleIntegrationAddress
        );

        return circleSimulator.encodeBurnMessageLog(circleMessage);
    }

    /**
     * @notice This test confirms that redeemTokens correctly mints tokens to
     * the user and pays the relayer the encoded relayer fee.
     */
    function testRedeemTransferTokensWithRelayZeroNative(
        uint8 counter,
        uint256 amount
    ) public {
        vm.assume(amount > 0 && amount < MAX_BURN_AMOUNT);

        // Fetch relayer fee from target contract, which is the relayer contract
        // in this case.
        uint256 encodedRelayerFee = relayer.relayerFee(
            relayer.chainId(),
            address(usdc)
        );
        vm.assume(amount > encodedRelayerFee);

        /**
         * Create TransferTokensWithRelay payload and then create the
         * DepositWithPayload wormhole message.
         *
         * Encode the relayer fee on the target chain (eth) so that
         * contract doensn't override the relayer fee in this test.
         */
        bytes memory transferWithRelayPayload = relayer.encodeTransferTokensWithRelay(
            ICircleRelayer.TransferTokensWithRelay({
                payloadId: 1,
                targetRelayerFee: encodedRelayerFee,
                toNativeTokenAmount: 0,
                targetRecipientWallet: addressToBytes32(recipientWallet)
            })
        );

        // build the DepositWithPayload struct
        ICircleIntegration.DepositWithPayload memory deposit =
            ICircleIntegration.DepositWithPayload({
                token: addressToBytes32(address(usdc)),
                amount: amount,
                sourceDomain: integration.getDomainFromChainId(targetChain),
                targetDomain: integration.localDomain(),
                nonce: type(uint64).max - counter,
                fromAddress: targetContract,
                mintRecipient: addressToBytes32(address(relayer)),
                payload: transferWithRelayPayload
            });

        // redeem parameters to invoke the contract with
        ICircleIntegration.RedeemParameters memory redeemParams;
        redeemParams.encodedWormholeMessage = createDepositWithPayloadMessage(
            targetChain,
            addressToBytes32(foreignCircleIntegrationAddress),
            deposit
        );

        // create Circle redeem parameters
        redeemParams.circleBridgeMessage = createCircleMessageFromEth(
            deposit
        );

        redeemParams.circleAttestation = circleSimulator.attestCircleMessage(
            redeemParams.circleBridgeMessage
        );

        // register the target contract
        relayer.registerContract(targetChain, targetContract);

        // initiate Balances struct
        Balances memory tokenBalances;

        // balance check the recipient and relayer
        tokenBalances.recipientBefore = getBalance(
            address(usdc),
            recipientWallet
        );
        tokenBalances.relayerBefore = getBalance(
            address(usdc),
            relayerWallet
        );

        // redeem the tokens
        vm.prank(relayerWallet);
        relayer.redeemTokens(redeemParams);

        // balance check the recipient and relayer
        tokenBalances.recipientAfter = getBalance(
            address(usdc),
            recipientWallet
        );
        tokenBalances.relayerAfter = getBalance(
            address(usdc),
            relayerWallet
        );

        // validate results
        assertEq(
            tokenBalances.recipientAfter - tokenBalances.recipientBefore,
            amount - encodedRelayerFee
        );
        assertEq(
            tokenBalances.relayerAfter - tokenBalances.relayerBefore,
            encodedRelayerFee
        );
    }

    /**
     * @notice This test confirms that redeemTokens correctly mints tokens to
     * the user and does not pay the relayer a fee.
     */
    function testRedeemTransferTokensWithRelayZeroNativeAndZeroFee(
        uint8 counter,
        uint256 amount
    ) public {
        vm.assume(amount > 0 && amount < MAX_BURN_AMOUNT);

        // Fetch relayer fee from target contract, which is the relayer contract
        // in this case.
        uint256 encodedRelayerFee = relayer.relayerFee(
            relayer.chainId(),
            address(usdc)
        );
        vm.assume(amount > encodedRelayerFee);

        /**
         * Create TransferTokensWithRelay payload and then create the
         * DepositWithPayload wormhole message.
         *
         * Encode the relayer fee on the target chain (eth) so that
         * contract doensn't override the relayer fee in this test.
         */
        bytes memory transferWithRelayPayload = relayer.encodeTransferTokensWithRelay(
            ICircleRelayer.TransferTokensWithRelay({
                payloadId: 1,
                targetRelayerFee: encodedRelayerFee,
                toNativeTokenAmount: 0,
                targetRecipientWallet: addressToBytes32(recipientWallet)
            })
        );

        // build the DepositWithPayload struct
        ICircleIntegration.DepositWithPayload memory deposit =
            ICircleIntegration.DepositWithPayload({
                token: addressToBytes32(address(usdc)),
                amount: amount,
                sourceDomain: integration.getDomainFromChainId(targetChain),
                targetDomain: integration.localDomain(),
                nonce: type(uint64).max - counter,
                fromAddress: targetContract,
                mintRecipient: addressToBytes32(address(relayer)),
                payload: transferWithRelayPayload
            });

        // redeem parameters to invoke the contract with
        ICircleIntegration.RedeemParameters memory redeemParams;
        redeemParams.encodedWormholeMessage = createDepositWithPayloadMessage(
            targetChain,
            addressToBytes32(foreignCircleIntegrationAddress),
            deposit
        );

        // create Circle redeem parameters
        redeemParams.circleBridgeMessage = createCircleMessageFromEth(
            deposit
        );

        redeemParams.circleAttestation = circleSimulator.attestCircleMessage(
            redeemParams.circleBridgeMessage
        );

        // register the target contract
        relayer.registerContract(targetChain, targetContract);

        // set the relayer fee to zero
        relayer.updateRelayerFee(
            relayer.chainId(),
            address(usdc),
            0
        );

        // initiate Balances struct
        Balances memory tokenBalances;

        // balance check the recipient and relayer
        tokenBalances.recipientBefore = getBalance(
            address(usdc),
            recipientWallet
        );
        tokenBalances.relayerBefore = getBalance(
            address(usdc),
            relayerWallet
        );

        // redeem the tokens
        vm.prank(relayerWallet);
        relayer.redeemTokens(redeemParams);

        // balance check the recipient and relayer
        tokenBalances.recipientAfter = getBalance(
            address(usdc),
            recipientWallet
        );
        tokenBalances.relayerAfter = getBalance(
            address(usdc),
            relayerWallet
        );

        // validate results
        assertEq(tokenBalances.recipientAfter - tokenBalances.recipientBefore, amount);
        assertEq(tokenBalances.relayerAfter - tokenBalances.relayerBefore, 0);
    }

     /**
     * @notice This test confirms that redeemTokens correctly mints tokens to
     * the user, swaps native gas, and pays the relayer the encoded relayer
     * fee. When the toNativeTokenAmount is greater than the max swap amount,
     * the contract will refund the relayer excess native gas.
     */
    function testRedeemTransferTokensWithRelayWithNative(
        uint8 counter,
        uint256 amount,
        uint256 toNativeTokenAmount
    ) public {
        vm.assume(amount > 0 && amount < MAX_BURN_AMOUNT);
        vm.assume(
            toNativeTokenAmount > 0 &&
            toNativeTokenAmount < amount &&
            toNativeTokenAmount < type(uint96).max
        );

        // Fetch relayer fee from target contract, which is the relayer contract
        // in this case.
        uint256 encodedRelayerFee = relayer.relayerFee(
            relayer.chainId(),
            address(usdc)
        );
        vm.assume(amount > encodedRelayerFee + toNativeTokenAmount);

        /**
         * Create TransferTokensWithRelay payload and then create the
         * DepositWithPayload wormhole message.
         *
         * Encode the relayer fee on the target chain (eth) so that
         * contract doensn't override the relayer fee in this test.
         */
        bytes memory transferWithRelayPayload = relayer.encodeTransferTokensWithRelay(
            ICircleRelayer.TransferTokensWithRelay({
                payloadId: 1,
                targetRelayerFee: encodedRelayerFee,
                toNativeTokenAmount: toNativeTokenAmount,
                targetRecipientWallet: addressToBytes32(recipientWallet)
            })
        );

        // build the DepositWithPayload struct
        ICircleIntegration.DepositWithPayload memory deposit =
            ICircleIntegration.DepositWithPayload({
                token: addressToBytes32(address(usdc)),
                amount: amount,
                sourceDomain: integration.getDomainFromChainId(targetChain),
                targetDomain: integration.localDomain(),
                nonce: type(uint64).max - counter,
                fromAddress: targetContract,
                mintRecipient: addressToBytes32(address(relayer)),
                payload: transferWithRelayPayload
            });

        // redeem parameters to invoke the contract with
        ICircleIntegration.RedeemParameters memory redeemParams;
        redeemParams.encodedWormholeMessage = createDepositWithPayloadMessage(
            targetChain,
            addressToBytes32(foreignCircleIntegrationAddress),
            deposit
        );

        // create Circle redeem parameters
        redeemParams.circleBridgeMessage = createCircleMessageFromEth(
            deposit
        );

        redeemParams.circleAttestation = circleSimulator.attestCircleMessage(
            redeemParams.circleBridgeMessage
        );

        // register the target contract
        relayer.registerContract(targetChain, targetContract);

        // check token balance of the recipient and relayer
        Balances memory tokenBalances;
        tokenBalances.recipientBefore = getBalance(
            address(usdc),
            recipientWallet
        );
        tokenBalances.relayerBefore = getBalance(
            address(usdc),
            relayerWallet
        );

        // check the native balance of the recipient
        Balances memory ethBalances;
        ethBalances.recipientBefore = recipientWallet.balance;

        // get a quote from the contract for the native gas swap
        uint256 nativeGasQuote = relayer.calculateNativeSwapAmountOut(
            address(usdc),
            toNativeTokenAmount
        );

        // hoax relayer and balance check
        hoax(relayerWallet, nativeGasQuote);
        ethBalances.relayerBefore = relayerWallet.balance;

        // call redeemTokens from relayer wallet
        relayer.redeemTokens{value: nativeGasQuote}(redeemParams);

        // check token balance of the recipient and relayer
        tokenBalances.recipientAfter = getBalance(
            address(usdc),
            recipientWallet
        );
        tokenBalances.relayerAfter = getBalance(
            address(usdc),
            relayerWallet
        );

        // check the native balance of the recipient and relayer
        ethBalances.recipientAfter = recipientWallet.balance;
        ethBalances.relayerAfter = relayerWallet.balance;

        /**
         * Overwrite the toNativeTokenAmount if the value is larger than
         * the max swap amount. The contract executes the same instruction.
         */
        uint256 maxToNative = relayer.calculateMaxSwapAmountIn(address(usdc));
        if (toNativeTokenAmount > maxToNative) {
            toNativeTokenAmount = maxToNative;
        }

        /**
         * Set the toNativeTokenAmount to zero if the nativeGasQuote is zero.
         * The nativeGasQuote can be zero if the toNativeTokenAmount is too little
         * to convert to native assets (solidity rounds towards zero).
         */
        if (nativeGasQuote == 0) {
            toNativeTokenAmount = 0;
        }

        // validate token balances
        assertEq(
            tokenBalances.recipientAfter - tokenBalances.recipientBefore,
            amount - encodedRelayerFee - toNativeTokenAmount
        );
        assertEq(
            tokenBalances.relayerAfter - tokenBalances.relayerBefore,
            encodedRelayerFee + toNativeTokenAmount
        );

        // validate eth balances
        uint256 maxNativeSwapAmount = relayer.maxNativeSwapAmount(address(usdc));
        assertEq(
            ethBalances.recipientAfter - ethBalances.recipientBefore,
            nativeGasQuote > maxNativeSwapAmount ? maxNativeSwapAmount : nativeGasQuote
        );
        assertEq(
            ethBalances.relayerBefore - ethBalances.relayerAfter,
            nativeGasQuote > maxNativeSwapAmount ? maxNativeSwapAmount : nativeGasQuote
        );
    }

     /**
     * @notice This test confirms that redeemTokens correctly mints tokens to
     * the user, swaps native gas, and pays the relayer the encoded relayer
     * fee. When the toNativeTokenAmount is greater than the max swap amount,
     * the contract will refund the relayer excess native gas.
     */
    function testRedeemTransferTokensWithRelaySelfRedeem(
        uint8 counter,
        uint256 amount,
        uint256 toNativeTokenAmount
    ) public {
        vm.assume(amount > 0 && amount < MAX_BURN_AMOUNT);
        vm.assume(
            toNativeTokenAmount < amount &&
            toNativeTokenAmount < type(uint96).max
        );

        // Fetch relayer fee from target contract, which is the relayer contract
        // in this case.
        uint256 encodedRelayerFee = relayer.relayerFee(
            relayer.chainId(),
            address(usdc)
        );
        vm.assume(amount > encodedRelayerFee + toNativeTokenAmount);

        /**
         * Create TransferTokensWithRelay payload and then create the
         * DepositWithPayload wormhole message.
         *
         * Encode the relayer fee on the target chain (eth) so that
         * contract doensn't override the relayer fee in this test.
         */
        bytes memory transferWithRelayPayload = relayer.encodeTransferTokensWithRelay(
            ICircleRelayer.TransferTokensWithRelay({
                payloadId: 1,
                targetRelayerFee: encodedRelayerFee,
                toNativeTokenAmount: toNativeTokenAmount,
                targetRecipientWallet: addressToBytes32(recipientWallet)
            })
        );

        // build the DepositWithPayload struct
        ICircleIntegration.DepositWithPayload memory deposit =
            ICircleIntegration.DepositWithPayload({
                token: addressToBytes32(address(usdc)),
                amount: amount,
                sourceDomain: integration.getDomainFromChainId(targetChain),
                targetDomain: integration.localDomain(),
                nonce: type(uint64).max - counter,
                fromAddress: targetContract,
                mintRecipient: addressToBytes32(address(relayer)),
                payload: transferWithRelayPayload
            });

        // redeem parameters to invoke the contract with
        ICircleIntegration.RedeemParameters memory redeemParams;
        redeemParams.encodedWormholeMessage = createDepositWithPayloadMessage(
            targetChain,
            addressToBytes32(foreignCircleIntegrationAddress),
            deposit
        );

        // create Circle redeem parameters
        redeemParams.circleBridgeMessage = createCircleMessageFromEth(
            deposit
        );

        redeemParams.circleAttestation = circleSimulator.attestCircleMessage(
            redeemParams.circleBridgeMessage
        );

        // register the target contract
        relayer.registerContract(targetChain, targetContract);

        // check token/eth balance of the recipient
        Balances memory tokenBalances;
        Balances memory ethBalances;
        tokenBalances.recipientBefore = getBalance(
            address(usdc),
            recipientWallet
        );
        ethBalances.recipientBefore = recipientWallet.balance;

        // call redeemTokens from relayer wallet
        vm.prank(recipientWallet);
        relayer.redeemTokens(redeemParams);

        // check token/eth balance of the recipient
        tokenBalances.recipientAfter = getBalance(
            address(usdc),
            recipientWallet
        );
        ethBalances.recipientAfter = recipientWallet.balance;

        // validate token/eth balances for the recipient
        assertEq(
            tokenBalances.recipientAfter - tokenBalances.recipientBefore,
            amount
        );
        assertEq(
            ethBalances.recipientAfter - ethBalances.recipientBefore,
            0
        );
    }

    /**
     * @notice This test confirms that redeemTokens correctly mints tokens to
     * the user, and pays the relayer the encoded fee. This tests explicitly
     * encodes a relayer fee that is less than the fee in the relayer contract's
     * state. The contract should use the minimum of the two.
     */
    function testRedeemTransferTokensWithRelayInconsistentFee(
        uint8 counter,
        uint256 amount,
        uint256 encodedRelayerFee
    ) public {
        // set toNativeTokenAmount to zero
        uint256 toNativeTokenAmount = 0;

        // fetch the relayer fee from the target contract (relayer contract)
        uint256 stateRelayerFee = relayer.relayerFee(
            relayer.chainId(),
            address(usdc)
        );
        vm.assume(encodedRelayerFee != stateRelayerFee);
        vm.assume(amount > 0 && amount < MAX_BURN_AMOUNT);
        vm.assume(encodedRelayerFee < amount);

        /**
         * Create TransferTokensWithRelay payload and then create the
         * DepositWithPayload wormhole message.
         *
         * Encode the relayer fee on the target chain (eth) so that
         * contract doensn't override the relayer fee in this test.
         */
        bytes memory transferWithRelayPayload = relayer.encodeTransferTokensWithRelay(
            ICircleRelayer.TransferTokensWithRelay({
                payloadId: 1,
                targetRelayerFee: encodedRelayerFee,
                toNativeTokenAmount: toNativeTokenAmount,
                targetRecipientWallet: addressToBytes32(recipientWallet)
            })
        );

        // build the DepositWithPayload struct
        ICircleIntegration.DepositWithPayload memory deposit =
            ICircleIntegration.DepositWithPayload({
                token: addressToBytes32(address(usdc)),
                amount: amount,
                sourceDomain: integration.getDomainFromChainId(targetChain),
                targetDomain: integration.localDomain(),
                nonce: type(uint64).max - counter,
                fromAddress: targetContract,
                mintRecipient: addressToBytes32(address(relayer)),
                payload: transferWithRelayPayload
            });

        // redeem parameters to invoke the contract with
        ICircleIntegration.RedeemParameters memory redeemParams;
        redeemParams.encodedWormholeMessage = createDepositWithPayloadMessage(
            targetChain,
            addressToBytes32(foreignCircleIntegrationAddress),
            deposit
        );

        // create Circle redeem parameters
        redeemParams.circleBridgeMessage = createCircleMessageFromEth(
            deposit
        );

        redeemParams.circleAttestation = circleSimulator.attestCircleMessage(
            redeemParams.circleBridgeMessage
        );

        // register the target contract
        relayer.registerContract(targetChain, targetContract);

        // check token balance of the recipient and relayer
        Balances memory tokenBalances;
        tokenBalances.recipientBefore = getBalance(
            address(usdc),
            recipientWallet
        );
        tokenBalances.relayerBefore = getBalance(
            address(usdc),
            relayerWallet
        );

        // check the native balance of the recipient
        Balances memory ethBalances;
        ethBalances.recipientBefore = recipientWallet.balance;

        // prank relayer and call redeemTokens
        vm.prank(relayerWallet);
        relayer.redeemTokens(redeemParams);

        // check token balance of the recipient and relayer
        tokenBalances.recipientAfter = getBalance(
            address(usdc),
            recipientWallet
        );
        tokenBalances.relayerAfter = getBalance(
            address(usdc),
            relayerWallet
        );

        // check the native balance of the recipient and relayer
        ethBalances.recipientAfter = recipientWallet.balance;

        // detemine which relayer fee the contract should use
        uint256 expectedRelayerFee =
            encodedRelayerFee < stateRelayerFee ? encodedRelayerFee : stateRelayerFee;

        // validate token balances
        assertEq(
            tokenBalances.recipientAfter - tokenBalances.recipientBefore,
            amount - expectedRelayerFee
        );
        assertEq(
            tokenBalances.relayerAfter - tokenBalances.relayerBefore,
            expectedRelayerFee
        );
    }

    /**
     * @notice This test confirms that the contract reverts if the fromAddress
     * in the DepositWithPayload message is not a registered contract.
     */
    function testRedeemTransferTokensWithRelayInvalidFromAddress(
        uint8 counter,
        uint256 amount
    ) public {
        // set toNativeTokenAmount to zero
        uint256 toNativeTokenAmount = 0;

        // fetch the relayer fee from the target contract (relayer contract)
        uint256 encodedRelayerFee = relayer.relayerFee(
            relayer.chainId(),
            address(usdc)
        );
        vm.assume(amount > 0 && amount < MAX_BURN_AMOUNT);

        /**
         * Create TransferTokensWithRelay payload and then create the
         * DepositWithPayload wormhole message.
         *
         * Encode the relayer fee on the target chain (eth) so that
         * contract doensn't override the relayer fee in this test.
         */
        bytes memory transferWithRelayPayload = relayer.encodeTransferTokensWithRelay(
            ICircleRelayer.TransferTokensWithRelay({
                payloadId: 1,
                targetRelayerFee: encodedRelayerFee,
                toNativeTokenAmount: toNativeTokenAmount,
                targetRecipientWallet: addressToBytes32(recipientWallet)
            })
        );

        // build the DepositWithPayload struct
        ICircleIntegration.DepositWithPayload memory deposit =
            ICircleIntegration.DepositWithPayload({
                token: addressToBytes32(address(usdc)),
                amount: amount,
                sourceDomain: integration.getDomainFromChainId(targetChain),
                targetDomain: integration.localDomain(),
                nonce: type(uint64).max - counter,
                fromAddress: targetContract,
                mintRecipient: addressToBytes32(address(relayer)),
                payload: transferWithRelayPayload
            });

        // redeem parameters to invoke the contract with
        ICircleIntegration.RedeemParameters memory redeemParams;
        redeemParams.encodedWormholeMessage = createDepositWithPayloadMessage(
            targetChain,
            addressToBytes32(foreignCircleIntegrationAddress),
            deposit
        );

        // create Circle redeem parameters
        redeemParams.circleBridgeMessage = createCircleMessageFromEth(
            deposit
        );

        redeemParams.circleAttestation = circleSimulator.attestCircleMessage(
            redeemParams.circleBridgeMessage
        );

        /**
         * NOTE: Do not register a target contract for this test. This is
         * to test that the contract checks the fromAddress in the wormhole
         * message payload.
         */

        // expect call to revert
        vm.prank(relayerWallet);
        vm.expectRevert("fromAddress is not a registered contract");
        relayer.redeemTokens(redeemParams);
    }

    /**
     * @notice This test confirms that the contract reverts if the recipient
     * attempts to swap native assets with the contract when self redeeming.
     */
    function testRedeemTransferTokensWithRelayInvalidSelfRedeem(
        uint8 counter,
        uint256 amount,
        uint256 toNativeTokenAmount
    ) public {
        vm.assume(amount > 0 && amount < MAX_BURN_AMOUNT);
        vm.assume(
            toNativeTokenAmount < amount &&
            toNativeTokenAmount < type(uint96).max
        );

        // Fetch relayer fee from target contract, which is the relayer contract
        // in this case.
        uint256 encodedRelayerFee = relayer.relayerFee(
            relayer.chainId(),
            address(usdc)
        );
        vm.assume(amount > encodedRelayerFee + toNativeTokenAmount);

        /**
         * Create TransferTokensWithRelay payload and then create the
         * DepositWithPayload wormhole message.
         *
         * Encode the relayer fee on the target chain (eth) so that
         * contract doensn't override the relayer fee in this test.
         */
        bytes memory transferWithRelayPayload = relayer.encodeTransferTokensWithRelay(
            ICircleRelayer.TransferTokensWithRelay({
                payloadId: 1,
                targetRelayerFee: encodedRelayerFee,
                toNativeTokenAmount: toNativeTokenAmount,
                targetRecipientWallet: addressToBytes32(recipientWallet)
            })
        );

        // build the DepositWithPayload struct
        ICircleIntegration.DepositWithPayload memory deposit =
            ICircleIntegration.DepositWithPayload({
                token: addressToBytes32(address(usdc)),
                amount: amount,
                sourceDomain: integration.getDomainFromChainId(targetChain),
                targetDomain: integration.localDomain(),
                nonce: type(uint64).max - counter,
                fromAddress: targetContract,
                mintRecipient: addressToBytes32(address(relayer)),
                payload: transferWithRelayPayload
            });

        // redeem parameters to invoke the contract with
        ICircleIntegration.RedeemParameters memory redeemParams;
        redeemParams.encodedWormholeMessage = createDepositWithPayloadMessage(
            targetChain,
            addressToBytes32(foreignCircleIntegrationAddress),
            deposit
        );

        // create Circle redeem parameters
        redeemParams.circleBridgeMessage = createCircleMessageFromEth(
            deposit
        );

        redeemParams.circleAttestation = circleSimulator.attestCircleMessage(
            redeemParams.circleBridgeMessage
        );

        // register the target contract
        relayer.registerContract(targetChain, targetContract);

        // get a quote from the contract for the native gas swap
        uint256 nativeGasQuote = relayer.calculateNativeSwapAmountOut(
            address(usdc),
            toNativeTokenAmount
        );
        vm.assume(nativeGasQuote > 0);

        // hoax recipient and balance check
        hoax(recipientWallet, nativeGasQuote);

        // expect call to revert
        bytes memory encodedSignature = abi.encodeWithSignature(
            "redeemTokens((bytes,bytes,bytes))",
            redeemParams
        );
        expectRevertWithValue(
            address(relayer),
            encodedSignature,
            "recipient cannot swap native assets",
            nativeGasQuote
        );
    }

    /**
     * @notice This test confirms that the contract reverts if the relayer
     * fails to provide enough native asset to the contract.
     */
    function testRedeemTransferTokensWithRelayInsufficientSwapAmount(
        uint8 counter,
        uint256 amount,
        uint256 toNativeTokenAmount
    ) public {
        vm.assume(amount > 0 && amount < MAX_BURN_AMOUNT);
        vm.assume(
            toNativeTokenAmount < amount &&
            toNativeTokenAmount < type(uint96).max
        );

        // Fetch relayer fee from target contract, which is the relayer contract
        // in this case.
        uint256 encodedRelayerFee = relayer.relayerFee(
            relayer.chainId(),
            address(usdc)
        );
        vm.assume(amount > encodedRelayerFee + toNativeTokenAmount);

        /**
         * Create TransferTokensWithRelay payload and then create the
         * DepositWithPayload wormhole message.
         *
         * Encode the relayer fee on the target chain (eth) so that
         * contract doensn't override the relayer fee in this test.
         */
        bytes memory transferWithRelayPayload = relayer.encodeTransferTokensWithRelay(
            ICircleRelayer.TransferTokensWithRelay({
                payloadId: 1,
                targetRelayerFee: encodedRelayerFee,
                toNativeTokenAmount: toNativeTokenAmount,
                targetRecipientWallet: addressToBytes32(recipientWallet)
            })
        );

        // build the DepositWithPayload struct
        ICircleIntegration.DepositWithPayload memory deposit =
            ICircleIntegration.DepositWithPayload({
                token: addressToBytes32(address(usdc)),
                amount: amount,
                sourceDomain: integration.getDomainFromChainId(targetChain),
                targetDomain: integration.localDomain(),
                nonce: type(uint64).max - counter,
                fromAddress: targetContract,
                mintRecipient: addressToBytes32(address(relayer)),
                payload: transferWithRelayPayload
            });

        // redeem parameters to invoke the contract with
        ICircleIntegration.RedeemParameters memory redeemParams;
        redeemParams.encodedWormholeMessage = createDepositWithPayloadMessage(
            targetChain,
            addressToBytes32(foreignCircleIntegrationAddress),
            deposit
        );

        // create Circle redeem parameters
        redeemParams.circleBridgeMessage = createCircleMessageFromEth(
            deposit
        );

        redeemParams.circleAttestation = circleSimulator.attestCircleMessage(
            redeemParams.circleBridgeMessage
        );

        // register the target contract
        relayer.registerContract(targetChain, targetContract);

        // get a quote from the contract for the native gas swap
        uint256 nativeGasQuote = relayer.calculateNativeSwapAmountOut(
            address(usdc),
            toNativeTokenAmount
        );
        vm.assume(nativeGasQuote > 0);

        // expect call to revert (relayer doesn't specify value)
        vm.prank(relayerWallet);
        vm.expectRevert("insufficient native asset amount");
        relayer.redeemTokens(redeemParams);
    }
}
