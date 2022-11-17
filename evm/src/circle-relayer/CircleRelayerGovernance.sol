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

    /// @notice `upgrade` serves to upgrade contract implementations
    function upgrade(uint16 chainId_, address newImplementation) public onlyOwner {
        require(chainId_ == chainId(), "wrong chain");

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
    ) public onlyOwner {
        require(chainId_ == chainId(), "wrong chain");
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
    ) public onlyOwner {
        require(chainId_ == chainId(), "wrong chain");
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

    /// @notice `registerContract` serves to save trusted circle relayer contract addresses
    function registerContract(
        uint16 chainId_,
        bytes32 contractAddress
    ) public onlyOwner {
        // sanity check both input arguments
        require(
            contractAddress != bytes32(0),
            "emitterAddress cannot equal bytes32(0)"
        );
        require(chainId_ != 0, "chainId must be > 0");

        // update the registeredEmitters state variable
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
        setRelayerFee(chainId_, token, amount);
    }

    /**
     * @notice `updateNativeSwapRate` serves to update the the swap rate of the native
     * asset price on this chain and the price of CircleIntegration supported assets.
     * The swapRate has a precision of 1e8. For example, for a swap rate of 1.5,
     * the swapRate argument should be 150000000.
     */
    function updateNativeSwapRate(
        address token,
        uint256 swapRate
    ) public onlyOwner {
        require(circleIntegration().isAcceptedToken(token), "token not accepted");
        require(swapRate > 0, "swap rate must be positive");

        setNativeSwapRate(token, swapRate);
    }

    /**
     * @notice `updateMaxSwapAmount` serves to update the max amount of native assets the
     * the contract will pay to the target recipient.
     */
    function updateMaxSwapAmount(
        address token,
        uint256 maxAmount
    ) public onlyOwner {
        setMaxSwapAmount(token, maxAmount);
    }

    modifier onlyOwner() {
        require(owner() == msg.sender, "caller not the owner");
        _;
    }
}
