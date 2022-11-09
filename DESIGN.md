# Circle-Relayer-Example

## Objective

Create an example contract that facilitates cross-chain transfers of Circle Bridge supported assets in a single click by composing on Wormhole's Circle Integration smart contract.

## Background

The Circle Bridge allows users to send USDC (and other supported assets) cross chain by burning tokens on the source chain, and minting new USDC on the target chain. Sending tokens cross chain is currently a three step process for users that interact with the Circle Bridge directly. First, the user must invoke the Circle Bridge to burn tokens on the source chain. Then the user must fetch an attestation from Circle's off-chain attestation process. Finally, the user invokes the Circle Bridge (and passes the attestation as an argument to the contract) on the target chain to mint tokens.

## Goals

Develop the following components to facilitate seamless cross-chain transfers of Circle Bridge supported assets:

- Smart contract that interacts with Wormhole's Circle Integration contract to burn and mint supported assets with additional instructions.
  - The additional instructions should include information regarding how to pay the off-chain relayer and the amount of native assets the off-chain relayer should pass to the target contract to be sent to the user.
- Off-chain process that relays Circle Bridge attestations and the associated Wormhole messages between the Circle-Relayer contracts on all supported networks.

## Non-Goals

This design document does not attempt to solve the following problems:

- Create a dynamic fee schedule for relayer payments based on market conditions.
- Pay relayers in native target chain assets.

## Detailed Design

To initiate a relayable transfer of Circle Bridge assets, a user will invoke the `transferTokensWithRelay` method on the `CircleRelayer` contract. The `transferTokensWithRelay` method takes five arguments:

- `token` - address of the Circle Bridge asset to be transferred
- `amount` - amount of tokens to be transferred
- `toNativeTokenAmount` - amount of tokens to swap into native assets on the target chain
- `targetChain` - Wormhole chain ID of the target blockchain
- `targetRecipientWallet` - user's wallet address on the target chain

`transferTokensWithRelay` will take custody of the user's tokens and call Wormhole's Circle Integration contract to initiate a token burn via the Circle Bridge. The Circle Integration contract will emit a Wormhole message (see the `Payloads` section of this design) containing instructions for how to pay the off-chain relayer and the quantity of transferred tokens to convert into native assets on the target chain.

Once a relayable transfer has been initiated, the off-chain relayer will fetch the attested Wormhole message and parse the transaction logs to locate a message emitted by the Circle Bridge contract. The Circle Bridge message contains information about the burn event and is necessary for completing the token mint on the target chain. The off-chain relayer will then pass the Circle Bridge message to Circle's off-chain attestation process. The attestation process returns a 65 byte signature, which the Circle Bridge contract requires (along with the Circle Bridge message) to complete the token mint on the target chain.

To complete the transfer, the off-chain relayer will invoke the `redeemTokens` method on the target `CircleRelayer` contract, passing the following arguments:

- Wormhole message emitted by the Circle Integration contract
- Circle Bridge message
- Circle Bridge attestation

The `CircleRelayer` contract will call the Circle Integration contract to complete the transfer, and take custody of the minted tokens. Finally it will parse the additional instructions from the Wormhole message payload and complete the following actions in order:

1. Verify that the caller of the Circle Integration contract on the source chain is a registered `CircleRelayer` contract
2. Calculate the amount of native assets to send the transferRecipient based on the `toNativeTokenAmount` parameter
3. Verify that the off-chain relayer passed enough native assets to the contract to fulfill the requested swap amount
4. Transfers requested native assets to the `targetRecipientWallet` address
5. Pays the relayer in the minted token denomination
6. Transfers the remaining minted tokens to the `targetRecipientWallet` address

## User API

```solidity
function transferTokensWithRelay(
    address token,
    uint256 amount,
    uint256 toNativeTokenAmount,
    uint16 targetChain,
    bytes32 targetRecipientWallet
) public payable returns (uint64 messageSequence)

function redeemTokens(ICircleIntegration.RedeemParameters memory redeemParams) public payable

function calculateMaxSwapAmount(address token) public view returns (uint256)

function calculateNativeSwapAmount(address token, uint256 toNativeAmount) public view returns (uint256)
```

## Governance API

```solidity
function upgrade(uint16 chainId_, address newImplementation) public onlyOwner

function updateWormholeFinality(uint16 chainId_, uint8 newWormholeFinality) public onlyOwner

function submitOwnershipTransferRequest(uint16 chainId_, address newOwner) public onlyOwner

function confirmOwnershipTransferRequest() public

function registerContract(uint16 chainId_, bytes32 contractAddress) public onlyOwner

function updateRelayerFee(uint16 chainId_, address token, uint256 amount) public onlyOwner

function updateNativeSwapRate(address token, uint256 swapRate) public onlyOwner

function updateMaxSwapAmount(address token, uint256 maxAmount) public onlyOwner
```

## Payload

```solidity
struct TransferTokensWithRelay {
    uint8 payloadId; // == 1
    uint256 targetRelayerFee;
    uint256 toNativeTokenAmount;
    bytes32 targetRecipientWallet;
}
```
