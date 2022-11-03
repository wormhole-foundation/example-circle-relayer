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

    /// @notice upgrade serves to upgrade contract implementations
    function upgrade(uint16 chainId_, address newImplementation) public onlyOwner {
        require(chainId_ == chainId(), "wrong chain");

        address currentImplementation = _getImplementation();

        _upgradeTo(newImplementation);

        /// @notice call initialize function of the new implementation
        (bool success, bytes memory reason) = newImplementation.delegatecall(
            abi.encodeWithSignature("initialize()")
        );

        require(success, string(reason));

        emit ContractUpgraded(currentImplementation, newImplementation);
    }

    /// @notice updateWormholeFinality serves to change the wormhole messaging consistencyLevel
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
     * @notice submitOwnershipTransferRequest serves to begin the ownership transfer process of the contracts
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
     * @notice confirmOwnershipTransferRequest serves to finalize an ownership transfer
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

    /// @notice registerContract serves to save trusted circle relayer contract addresses
    function registerContract(
        uint16 chainId,
        bytes32 contractAddress
    ) public onlyOwner {
        // sanity check both input arguments
        require(
            contractAddress != bytes32(0),
            "emitterAddress cannot equal bytes32(0)"
        );
        require(
            getRegisteredContract(chainId) == bytes32(0),
            "emitterChainId already registered"
        );

        // update the registeredEmitters state variable
        _registerContract(chainId, contractAddress);
    }

    /// @notice updateRelayerFee serves to update the fee for relaying transfers
    function updateRelayerFee(uint256 amount) public onlyOwner {
        setRelayerFee(amount);
    }

    modifier onlyOwner() {
        require(owner() == msg.sender, "caller not the owner");
        _;
    }
}
