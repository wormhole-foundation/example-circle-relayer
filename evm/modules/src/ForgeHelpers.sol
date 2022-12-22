// SPDX-License-Identifier: Apache 2
pragma solidity ^0.8.13;

import "../../src/libraries/BytesLib.sol";

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "forge-std/Vm.sol";
import "forge-std/console.sol";

contract ForgeHelpers {
    using BytesLib for bytes;

    function expectRevert(
        address contractAddress,
        bytes memory encodedSignature,
        string memory expectedRevert
    ) internal {
        (bool success, bytes memory result) = contractAddress.call(
            encodedSignature
        );
        require(!success, "call did not revert");

        // compare revert strings
        bytes32 expectedRevertHash = keccak256(abi.encode(expectedRevert));
        bytes32 actualRevertHash = keccak256(result.slice(4, result.length - 4));
        require(
             expectedRevertHash == actualRevertHash,
            "call did not revert as expected"
        );
    }

    function expectRevertWithValue(
        address contractAddress,
        bytes memory encodedSignature,
        string memory expectedRevert,
        uint256 value_
    ) internal {
        (bool success, bytes memory result) = contractAddress.call{value: value_}(
            encodedSignature
        );
        require(!success, "call did not revert");

        // compare revert strings
        bytes32 expectedRevertHash = keccak256(abi.encode(expectedRevert));
        bytes32 actualRevertHash = keccak256(result.slice(4, result.length - 4));
        require(
             expectedRevertHash == actualRevertHash,
            "call did not revert as expected"
        );
    }

    function getBalance(
        address token,
        address wallet
    ) internal view returns (uint256 balance) {
        (, bytes memory queriedBalance) =
            token.staticcall(
                abi.encodeWithSelector(IERC20.balanceOf.selector, wallet)
            );
        balance = abi.decode(queriedBalance, (uint256));
    }

    /// @notice Converts 20-byte addresses to bytes32 (zero-left-padded)
    function addressToBytes32(address address_) public pure returns (bytes32) {
        return bytes32(uint256(uint160(address_)));
    }
}
