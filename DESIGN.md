# Circle Relayer Example

## Objective

Create an example contract that facilitates cross-chain transfers of Circle Bridge supported assets in a single click by composing on Wormhole's [Circle Integration] smart contract.

## Background

The Circle Bridge allows users to send USDC and other Circle-supported assets cross chain by burning tokens on the source chain and minting the related token on the target chain (e.g. burn x amount of USDC on Ethereum and mint x amount of USDC on Avalanche).

Sending tokens cross chain is currently a three-step process for users that interact with the Circle Bridge directly.
1. User invokes the Circle Bridge to burn tokens on the source chain. This contract emits a message encoding info about the burned token.
2. User submits emitted message to Circle's off-chain REST process and fetches a message attestation.
3. User invokes Circle's Message Transmitter on the target chain to mint tokens using the emitted message and message attestation.

## Goals

Develop the following components to facilitate seamless cross-chain transfers of Circle Bridge supported assets:

- Smart contract that interacts with Wormhole's [Circle Integration] contract to burn and mint supported assets with additional information encoded in its arbitrary payload:
  - Fee to use the off-chain relayer.
  - Amount of native asset the off-chain relayer should pass to the target contract, which will send the native asset to the user.
- Off-chain process that relays transactions using Circle Bridge attestations and associated Wormhole messages among the network of Circle Relayer contracts on all supported blockchains.

## Non-Goals

This design document does not attempt to solve the following problems:

- Create a dynamic fee schedule for relayer payments based on market conditions.
- Pay relayers in native target chain assets.

## Detailed Design

To initiate a relayable transfer of Circle Bridge assets, a user will invoke the `transferTokensWithRelay` method on the `CircleRelayer` contract. The `transferTokensWithRelay` method takes five arguments:

- `token` - Address of the Circle Bridge asset to be transferred.
- `amount` - Amount of tokens to be transferred.
- `toNativeTokenAmount` - Amount of tokens to swap into native assets on the target chain.
- `targetChain` - Wormhole chain ID of the target blockchain.
- `targetRecipientWallet` - User's wallet address on the target chain.

`transferTokensWithRelay` takes custody of the user's tokens and calls Wormhole's [Circle Integration] contract to initiate a token burn via the Circle Bridge. This contract emits a Wormhole message (see the `Payloads` section of this design) containing instructions on how to pay the off-chain relayer and the quantity of transferred tokens to convert into native assets on the target chain.

Once the user initiates a relayable transfer (i.e. user submits transaction), the off-chain relayer fetches the attested Wormhole message and parses the transaction logs to locate the message emitted by the Circle Bridge contract. The off-chain relayer sends a request to Circle's off-chain process with this message and grabs the attestation from the process's response (serialized EC signatures), which validates the token mint on the target chain.

To complete the transfer, the off-chain relayer invokes the `redeemTokens` method on the target `CircleRelayer` contract, passing the following arguments:
- Wormhole message emitted by the Circle Integration contract
- Circle Bridge message
- Circle Bridge attestation

The `CircleRelayer` contract calls the [Circle Integration] contract to complete the transfer and takes custody of the minted tokens. It parses the additional instructions from the Wormhole message payload and completes the following actions in order:
1. Verify that the caller of the Circle Integration contract on the source chain is a registered `CircleRelayer` contract.
2. Calculate the amount of native assets to send the transferRecipient based on the `toNativeTokenAmount` parameter.
3. Verify that the off-chain relayer passed enough native assets to the contract to fulfill the requested swap amount.
4. Transfer requested native assets to the `targetRecipientWallet` address.
5. Pay the relayer in the minted token denomination.
6. Transfer the remaining minted tokens to the `targetRecipientWallet` address.

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

[circle integration]: https://github.com/certusone/wormhole-circle-integration
