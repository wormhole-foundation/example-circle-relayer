// SPDX-License-Identifier: Apache 2
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Upgrade.sol";

import "./CircleRelayer.sol";

contract CircleRelayerImplementation is CircleRelayer {
    function initialize() initializer public virtual {}

    modifier initializer() {
        address impl = ERC1967Upgrade._getImplementation();

        require(!isInitialized(impl), "already initialized");

        setInitialized(impl);

        _;
    }
}
