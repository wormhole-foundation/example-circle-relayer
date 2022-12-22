// SPDX-License-Identifier: Apache 2
pragma solidity ^0.8.13;

import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Upgrade.sol";

import "./CircleRelayerSetters.sol";
import "./CircleRelayerGetters.sol";
import "./CircleRelayerState.sol";

contract CircleRelayerGovernance is CircleRelayerGetters, ERC1967Upgrade {
    event ContractUpgraded(address indexed oldContract, address indexed newContract);
    event WormholeFinalityUpdated(uint8 indexed oldLevel, uint8 indexed newFinality);
    event OwnershipTransfered(address indexed oldOwner, address indexed newOwner);
    event SwapRateUpdated(address indexed token, uint256 indexed swapRate);

    /// @notice `upgrade` serves to upgrade contract implementations
    function upgrade(
        uint16 chainId_,
        address newImplementation
    ) public onlyOwner checkChain(chainId_) {
        require(newImplementation != address(0), "invalid implementation");

        address currentImplementation = _getImplementation();

        _upgradeTo(newImplementation);

        // call initialize function of the new implementation
        (bool success, bytes memory reason) = newImplementation.delegatecall(
            abi.encodeWithSignature("initialize()")
        );

        require(success, string(reason));

        emit ContractUpgraded(currentImplementation, newImplementation);
    }

    /// @notice `updateWormholeFinality` serves to change the wormhole messaging consistencyLevel
    function updateWormholeFinality(
        uint16 chainId_,
        uint8 newWormholeFinality
    ) public onlyOwner checkChain(chainId_) {
        require(newWormholeFinality > 0, "invalid wormhole finality");

        uint8 currentWormholeFinality = wormholeFinality();

        setWormholeFinality(newWormholeFinality);

        emit WormholeFinalityUpdated(currentWormholeFinality, newWormholeFinality);
    }

    /**
     * @notice `submitOwnershipTransferRequest` serves to begin the ownership transfer process of the contracts
     * - it saves an address for the new owner in the pending state
     */
    function submitOwnershipTransferRequest(
        uint16 chainId_,
        address newOwner
    ) public onlyOwner checkChain(chainId_) {
        require(newOwner != address(0), "newOwner cannot equal address(0)");

        setPendingOwner(newOwner);
    }

    /**
     * @notice `confirmOwnershipTransferRequest` serves to finalize an ownership transfer
     * - it checks that the caller is the pendingOwner to validate the wallet address
     * - it updates the owner state variable with the pendingOwner state variable
     */
    function confirmOwnershipTransferRequest() public {
        // cache the new owner address
        address newOwner = pendingOwner();

        require(msg.sender == newOwner, "caller must be pendingOwner");

        // cache currentOwner for Event
        address currentOwner = owner();

        // update the owner in the contract state and reset the pending owner
        setOwner(newOwner);
        setPendingOwner(address(0));

        emit OwnershipTransfered(currentOwner, newOwner);
    }

    /**
     * @notice `registerContract` serves to save trusted circle relayer contract
     * addresses.
     */
    function registerContract(
        uint16 chainId_,
        bytes32 contractAddress
    ) public onlyOwner {
        // sanity check both input arguments
        require(
            contractAddress != bytes32(0),
            "contractAddress cannot equal bytes32(0)"
        );
        require(
            chainId_ != 0 && chainId_ != chainId(),
            "chainId_ cannot equal 0 or this chainId"
        );

        // update the registeredContracts state variable
        _registerContract(chainId_, contractAddress);
    }

    /**
     * @notice `updateRelayerFee` serves to update the fee for relaying transfers
     * on all registered contracts.
     */
    function updateRelayerFee(
        uint16 chainId_,
        address token,
        uint256 amount
    ) public onlyOwner {
        require(
            (chainId_ == chainId()) ||
            getRegisteredContract(chainId_) != bytes32(0),
            "contract doesn't exist"
        );
        require(
            circleIntegration().isAcceptedToken(token),
            "token not accepted"
        );
        setRelayerFee(chainId_, token, amount);
    }

    /**
     * @notice `updateNativeSwapRate` serves to update the swap rate of the native
     * asset price on this chain and the price of CircleIntegration supported assets.
     */
    function updateNativeSwapRate(
        uint16 chainId_,
        address token,
        uint256 swapRate
    ) public onlyOwner checkChain(chainId_) {
        require(circleIntegration().isAcceptedToken(token), "token not accepted");
        require(swapRate > 0, "swap rate must be nonzero");

        setNativeSwapRate(token, swapRate);

        emit SwapRateUpdated(token, swapRate);
    }

    /// @notice write update swap rate precision
    function updateNativeSwapRatePrecision(
        uint16 chainId_,
        uint256 nativeSwapRatePrecision_
    ) public onlyOwner checkChain(chainId_) {
        require(nativeSwapRatePrecision_ > 0, "precision must be > 0");

        setNativeSwapRatePrecision(nativeSwapRatePrecision_);
    }

    /**
     * @notice `updateMaxSwapAmount` serves to update the max amount of native assets the
     * the contract will pay to the target recipient.
     */
    function updateMaxNativeSwapAmount(
        uint16 chainId_,
        address token,
        uint256 maxAmount
    ) public onlyOwner checkChain(chainId_) {
        require(circleIntegration().isAcceptedToken(token), "token not accepted");

        setMaxNativeSwapAmount(token, maxAmount);
    }

    modifier onlyOwner() {
        require(owner() == msg.sender, "caller not the owner");
        _;
    }

    modifier checkChain(uint16 chainId_) {
        require(chainId() == chainId_, "wrong chain");
        _;
    }
}
