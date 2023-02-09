import {expect} from "chai";
import {ethers} from "ethers";
import {
  CHAIN_ID_AVAX,
  CHAIN_ID_ETH,
  tryNativeToHexString,
} from "@certusone/wormhole-sdk";
import {
  ETH_USDC_TOKEN_ADDRESS,
  AVAX_USDC_TOKEN_ADDRESS,
  ETH_CIRCLE_INTEGRATION_ADDRESS,
  AVAX_CIRCLE_INTEGRATION_ADDRESS,
  GUARDIAN_PRIVATE_KEY,
  WORMHOLE_GUARDIAN_SET_INDEX,
  ETH_LOCALHOST,
  WALLET_PRIVATE_KEY,
  WALLET_PRIVATE_KEY_TWO,
  AVAX_LOCALHOST,
  ETH_FORK_CHAIN_ID,
  AVAX_FORK_CHAIN_ID,
  ETH_WORMHOLE_ADDRESS,
  AVAX_WORMHOLE_ADDRESS,
} from "./helpers/consts";
import {
  ICircleRelayer__factory,
  ICircleIntegration__factory,
  IUSDC__factory,
  IWormhole__factory,
} from "../src/ethers-contracts";
import {MockGuardians} from "@certusone/wormhole-sdk/lib/cjs/mock";
import {RedeemParameters} from "../src";
import {findCircleMessageInLogs} from "../src/logs";
import {
  MockCircleAttester,
  readCircleRelayerProxyAddress,
  findWormholeMessageInLogs,
  findRedeemEventInLogs,
} from "./helpers/utils";

describe("Circle Integration Test", () => {
  // ethereum wallet, CircleIntegration contract and USDC contract
  const ethProvider = new ethers.providers.StaticJsonRpcProvider(ETH_LOCALHOST);
  const ethWallet = new ethers.Wallet(WALLET_PRIVATE_KEY, ethProvider);
  const ethRelayerWallet = new ethers.Wallet(
    WALLET_PRIVATE_KEY_TWO,
    ethProvider
  );
  const ethCircleRelayer = ICircleRelayer__factory.connect(
    readCircleRelayerProxyAddress(ETH_FORK_CHAIN_ID),
    ethWallet
  );
  const ethCircleIntegration = ICircleIntegration__factory.connect(
    ETH_CIRCLE_INTEGRATION_ADDRESS,
    ethWallet
  );
  const ethUsdc = IUSDC__factory.connect(ETH_USDC_TOKEN_ADDRESS, ethWallet);

  // avalanche wallet, CircleIntegration contract and USDC contract
  const avaxProvider = new ethers.providers.StaticJsonRpcProvider(
    AVAX_LOCALHOST
  );
  const avaxWallet = new ethers.Wallet(WALLET_PRIVATE_KEY, avaxProvider);
  const avaxRelayerWallet = new ethers.Wallet(
    WALLET_PRIVATE_KEY_TWO,
    avaxProvider
  );
  const avaxCircleRelayer = ICircleRelayer__factory.connect(
    readCircleRelayerProxyAddress(AVAX_FORK_CHAIN_ID),
    avaxWallet
  );
  const avaxCircleIntegration = ICircleIntegration__factory.connect(
    AVAX_CIRCLE_INTEGRATION_ADDRESS,
    avaxWallet
  );
  const avaxUsdc = IUSDC__factory.connect(AVAX_USDC_TOKEN_ADDRESS, avaxWallet);

  // MockGuardians and MockCircleAttester objects
  const guardians = new MockGuardians(WORMHOLE_GUARDIAN_SET_INDEX, [
    GUARDIAN_PRIVATE_KEY,
  ]);
  const circleAttester = new MockCircleAttester(GUARDIAN_PRIVATE_KEY);

  // Wormhole contracts
  const ethWormhole = IWormhole__factory.connect(
    ETH_WORMHOLE_ADDRESS,
    ethWallet
  );
  const avaxWormhole = IWormhole__factory.connect(
    AVAX_WORMHOLE_ADDRESS,
    avaxWallet
  );

  // relayer fees and decimals (for USDC token)
  const usdcDecimals = 6;
  const ethRelayerFee = ethers.utils.parseUnits("5", usdcDecimals);
  const avaxRelayerFee = ethers.utils.parseUnits("0.5", usdcDecimals);

  // native swap rates (in USD)
  const ethNativeSwapRate = ethers.BigNumber.from("1200");
  const avaxNativeSwapRate = ethers.BigNumber.from("15");

  // max native swap amount
  const ethMaxNativeSwapAmount = ethers.utils.parseEther("5");
  const avaxMaxNativeSwapAmount = ethers.utils.parseEther("100");

  describe("Contract Setup", () => {
    describe("Ethereum Goerli Testnet", () => {
      it("Should Register Circle Relayer Target Contract", async () => {
        // Convert the target contract address to bytes32, since other
        // non-evm blockchains (e.g. Solana) have 32 byte wallet addresses.
        const targetContractAddressHex =
          "0x" + tryNativeToHexString(avaxCircleRelayer.address, CHAIN_ID_AVAX);

        // register the emitter
        const receipt = await ethCircleRelayer
          .registerContract(CHAIN_ID_AVAX, targetContractAddressHex)
          .then((tx: ethers.ContractTransaction) => tx.wait())
          .catch((msg: any) => {
            // should not happen
            console.log(msg);
            return null;
          });
        expect(receipt).is.not.null;

        // query the contract and confirm that the contract address is set in storage
        const emitterInContractState =
          await ethCircleRelayer.getRegisteredContract(CHAIN_ID_AVAX);
        expect(emitterInContractState).to.equal(targetContractAddressHex);
      });

      it("Should Set Target Relayer Fee for USDC", async () => {
        // set the relayer fee for USDC
        const receipt = await ethCircleRelayer
          .updateRelayerFee(CHAIN_ID_AVAX, ethUsdc.address, avaxRelayerFee)
          .then((tx: ethers.ContractTransaction) => tx.wait())
          .catch((msg: any) => {
            // should not happen
            console.log(msg);
            return null;
          });
        expect(receipt).is.not.null;

        // check contract state
        const relayerFeeInState = await ethCircleRelayer.relayerFee(
          CHAIN_ID_AVAX,
          ethUsdc.address
        );
        expect(relayerFeeInState.toString()).to.equal(
          avaxRelayerFee.toString()
        );
      });

      it("Should Set Native Swap Rate", async () => {
        // fetch the swap rate precision and compute the native swap rate
        const swapRatePrecision =
          await ethCircleRelayer.nativeSwapRatePrecision();
        const nativeSwapRate = ethNativeSwapRate.mul(swapRatePrecision);

        // set the relayer fee for USDC
        const receipt = await ethCircleRelayer
          .updateNativeSwapRate(CHAIN_ID_ETH, ethUsdc.address, nativeSwapRate)
          .then((tx: ethers.ContractTransaction) => tx.wait())
          .catch((msg: any) => {
            // should not happen
            console.log(msg);
            return null;
          });
        expect(receipt).is.not.null;

        // check contract state
        const swapRateInState = await ethCircleRelayer.nativeSwapRate(
          ethUsdc.address
        );
        expect(swapRateInState.toString()).to.equal(nativeSwapRate.toString());
      });

      it("Should Set Max Native Swap Amount", async () => {
        // set the max native swap amount for USDC
        const receipt = await ethCircleRelayer
          .updateMaxNativeSwapAmount(
            CHAIN_ID_ETH,
            ethUsdc.address,
            ethMaxNativeSwapAmount
          )
          .then((tx: ethers.ContractTransaction) => tx.wait())
          .catch((msg: any) => {
            // should not happen
            console.log(msg);
            return null;
          });
        expect(receipt).is.not.null;

        // check contract state
        const maxSwapAmountInState = await ethCircleRelayer.maxNativeSwapAmount(
          ethUsdc.address
        );
        expect(maxSwapAmountInState.toString()).to.equal(
          ethMaxNativeSwapAmount.toString()
        );
      });
    });
    describe("Avalanche Fuji Testnet", () => {
      it("Should Register Circle Relayer Target Contract", async () => {
        // Convert the target contract address to bytes32, since other
        // non-evm blockchains (e.g. Solana) have 32 byte wallet addresses.
        const targetContractAddressHex =
          "0x" + tryNativeToHexString(ethCircleRelayer.address, CHAIN_ID_ETH);

        // register the emitter
        const receipt = await avaxCircleRelayer
          .registerContract(CHAIN_ID_ETH, targetContractAddressHex)
          .then((tx: ethers.ContractTransaction) => tx.wait())
          .catch((msg: any) => {
            // should not happen
            console.log(msg);
            return null;
          });
        expect(receipt).is.not.null;

        // query the contract and confirm that the contract address is set in storage
        const emitterInContractState =
          await avaxCircleRelayer.getRegisteredContract(CHAIN_ID_ETH);
        expect(emitterInContractState).to.equal(targetContractAddressHex);
      });

      it("Should Set Target Relayer Fee for USDC", async () => {
        // set the relayer fee for USDC
        const receipt = await avaxCircleRelayer
          .updateRelayerFee(CHAIN_ID_ETH, avaxUsdc.address, ethRelayerFee)
          .then((tx: ethers.ContractTransaction) => tx.wait())
          .catch((msg: any) => {
            // should not happen
            console.log(msg);
            return null;
          });
        expect(receipt).is.not.null;

        // check contract state
        const relayerFeeInState = await avaxCircleRelayer.relayerFee(
          CHAIN_ID_ETH,
          avaxUsdc.address
        );
        expect(relayerFeeInState.toString()).to.equal(ethRelayerFee.toString());
      });

      it("Should Set Native Swap Rate", async () => {
        // fetch the swap rate precision and compute the native swap rate
        const swapRatePrecision =
          await avaxCircleRelayer.nativeSwapRatePrecision();
        const nativeSwapRate = avaxNativeSwapRate.mul(swapRatePrecision);

        // set the relayer fee for USDC
        const receipt = await avaxCircleRelayer
          .updateNativeSwapRate(CHAIN_ID_AVAX, avaxUsdc.address, nativeSwapRate)
          .then((tx: ethers.ContractTransaction) => tx.wait())
          .catch((msg: any) => {
            // should not happen
            console.log(msg);
            return null;
          });
        expect(receipt).is.not.null;

        // check contract state
        const swapRateInState = await avaxCircleRelayer.nativeSwapRate(
          avaxUsdc.address
        );
        expect(swapRateInState.toString()).to.equal(nativeSwapRate.toString());
      });

      it("Should Set Max Native Swap Amount", async () => {
        // set the max native swap amount for USDC
        const receipt = await avaxCircleRelayer
          .updateMaxNativeSwapAmount(
            CHAIN_ID_AVAX,
            avaxUsdc.address,
            avaxMaxNativeSwapAmount
          )
          .then((tx: ethers.ContractTransaction) => tx.wait())
          .catch((msg: any) => {
            // should not happen
            console.log(msg);
            return null;
          });
        expect(receipt).is.not.null;

        // check contract state
        const maxSwapAmountInState =
          await avaxCircleRelayer.maxNativeSwapAmount(avaxUsdc.address);
        expect(maxSwapAmountInState.toString()).to.equal(
          avaxMaxNativeSwapAmount.toString()
        );
      });
    });
    describe("Transfer Tokens With Relay Logic", () => {
      // amounts from Ethereum
      const amountFromEth = ethers.BigNumber.from("6900000");
      const toNativeTokenAmountEth = ethers.BigNumber.from("500000");

      // amounts from Avalanche
      const amountFromAvax = ethers.BigNumber.from("42000000");
      const toNativeTokenAmountAvax = ethers.BigNumber.from("0");

      let localVariables: any = {};

      it("Should Transfer Tokens With Relay On Ethereum", async () => {
        // create transferTokenWithRelay parameters
        const targetRecipientWallet =
          "0x" + tryNativeToHexString(avaxWallet.address, "avalanche");

        // increase allowance
        {
          const receipt = await ethUsdc
            .approve(ethCircleRelayer.address, amountFromEth)
            .then((tx) => tx.wait());
        }

        // grab USDC balance before performing the transfer
        const balanceBefore = await ethUsdc.balanceOf(ethWallet.address);

        // call transferTokensWithRelay
        const receipt = await ethCircleRelayer
          .transferTokensWithRelay(
            ethUsdc.address,
            amountFromEth,
            toNativeTokenAmountEth,
            CHAIN_ID_AVAX,
            targetRecipientWallet
          )
          .then(async (tx) => {
            const receipt = await tx.wait();
            return receipt;
          })
          .catch((msg) => {
            // should not happen
            console.log(msg);
            return null;
          });
        expect(receipt).is.not.null;

        // check USDC balance after to confirm the transfer worked
        const balanceAfter = await ethUsdc.balanceOf(ethWallet.address);
        expect(balanceBefore.sub(balanceAfter).eq(amountFromEth)).is.true;

        // grab Circle message from logs
        const circleMessage = await ethCircleIntegration
          .circleTransmitter()
          .then((address) => findCircleMessageInLogs(receipt!.logs, address));
        expect(circleMessage).is.not.null;

        // grab attestation
        const circleAttestation = circleAttester.attestMessage(
          ethers.utils.arrayify(circleMessage!)
        );

        // now grab the Wormhole message
        const wormholeMessage = await ethCircleIntegration
          .wormhole()
          .then((address) =>
            findWormholeMessageInLogs(
              receipt!.logs,
              address,
              CHAIN_ID_ETH as number
            )
          );
        expect(wormholeMessage).is.not.null;

        // sign the DepositWithPayload message
        const encodedWormholeMessage = Uint8Array.from(
          guardians.addSignatures(wormholeMessage!, [0])
        );

        // save all of the redeem parameters
        localVariables.circleBridgeMessage = circleMessage!;
        localVariables.circleAttestation = circleAttestation!;
        localVariables.encodedWormholeMessage = encodedWormholeMessage;
      });

      it("Should Redeem Tokens With Relay On Avalanche (With Native Airdrop)", async () => {
        // create RedeemParameters struct to invoke the target contract with
        const redeemParameters: RedeemParameters = {
          circleBridgeMessage: localVariables.circleBridgeMessage!,
          circleAttestation: localVariables.circleAttestation!,
          encodedWormholeMessage: localVariables.encodedWormholeMessage!,
        };

        // clear the localVariables object
        localVariables = {};

        // grab the token balance before redeeming the transfer
        const balanceBefore = await avaxUsdc.balanceOf(avaxWallet.address);
        const relayerBalanceBefore = await avaxUsdc.balanceOf(
          avaxRelayerWallet.address
        );

        // grab ether balance before redeeming the transfer
        const avaxBalanceBefore = await avaxWallet.getBalance();
        const avaxRelayerBalanceBefore = await avaxRelayerWallet.getBalance();

        // fetch the native asset swap quote
        const nativeSwapQuote =
          await avaxCircleRelayer.calculateNativeSwapAmountOut(
            avaxUsdc.address,
            toNativeTokenAmountEth
          );

        // redeem the transfer with the relayer's wallet
        const receipt = await avaxCircleRelayer
          .connect(avaxRelayerWallet) // change signer to the relayer
          .redeemTokens(redeemParameters, {value: nativeSwapQuote})
          .then(async (tx) => {
            const receipt = await tx.wait();
            return receipt;
          })
          .catch((msg) => {
            // should not happen
            console.log(msg);
            return null;
          });
        expect(receipt).is.not.null;

        // parse the wormhole message
        const parsedMessage = await avaxWormhole.parseVM(
          redeemParameters.encodedWormholeMessage
        );

        // fetch the Redeem event emitted by the contract
        const event = findRedeemEventInLogs(
          receipt!.logs,
          avaxCircleIntegration.address
        );
        expect(event.emitterChainId).to.equal(parsedMessage.emitterChainId);
        expect(event.emitterAddress).to.equal(parsedMessage.emitterAddress);
        expect(event.sequence.toString()).to.equal(
          parsedMessage.sequence.toString()
        );

        // grab the token balance after redeeming the transfer
        const balanceAfter = await avaxUsdc.balanceOf(avaxWallet.address);
        const relayerBalanceAfter = await avaxUsdc.balanceOf(
          avaxRelayerWallet.address
        );

        // grab ether balance after redeeming the transfer
        const avaxBalanceAfter = await avaxWallet.getBalance();
        const avaxRelayerBalanceAfter = await avaxRelayerWallet.getBalance();

        // fetch the relayer fee
        const relayerFee = await ethCircleRelayer.relayerFee(
          CHAIN_ID_AVAX,
          ethUsdc.address
        );

        // fetch the max swap amount
        const maxSwapAmount = await ethCircleRelayer.maxNativeSwapAmount(
          ethUsdc.address
        );

        // determine amount actually swapped with the contract based on the max
        let actualNativeSwapAmount = nativeSwapQuote;
        if (actualNativeSwapAmount > maxSwapAmount) {
          actualNativeSwapAmount = maxSwapAmount;
        }

        // recipient token balance
        expect(
          balanceAfter
            .sub(balanceBefore)
            .eq(amountFromEth.sub(relayerFee).sub(toNativeTokenAmountEth))
        ).is.true;

        // relayer token balance
        expect(
          relayerBalanceAfter
            .sub(relayerBalanceBefore)
            .eq(relayerFee.add(toNativeTokenAmountEth))
        ).is.true;

        // recipient ether balance
        expect(
          avaxBalanceAfter.sub(avaxBalanceBefore).eq(actualNativeSwapAmount)
        ).is.true;

        // relayer ether balance
        expect(
          avaxRelayerBalanceBefore
            .sub(avaxRelayerBalanceAfter)
            .gte(actualNativeSwapAmount)
        ).is.true;
      });

      it("Should Transfer Tokens With Relay On Avalanche", async () => {
        // create transferTokenWithRelay parameters
        const targetRecipientWallet =
          "0x" + tryNativeToHexString(ethWallet.address, "ethereum");

        // increase allowance
        {
          const receipt = await avaxUsdc
            .approve(avaxCircleRelayer.address, amountFromAvax)
            .then((tx) => tx.wait());
        }

        // grab USDC balance before performing the transfer
        const balanceBefore = await avaxUsdc.balanceOf(avaxWallet.address);

        // call transferTokensWithRelay
        const receipt = await avaxCircleRelayer
          .transferTokensWithRelay(
            avaxUsdc.address,
            amountFromAvax,
            toNativeTokenAmountAvax,
            CHAIN_ID_ETH,
            targetRecipientWallet
          )
          .then(async (tx) => {
            const receipt = await tx.wait();
            return receipt;
          })
          .catch((msg) => {
            // should not happen
            console.log(msg);
            return null;
          });
        expect(receipt).is.not.null;

        // check USDC balance after to confirm the transfer worked
        const balanceAfter = await avaxUsdc.balanceOf(avaxWallet.address);
        expect(balanceBefore.sub(balanceAfter).eq(amountFromAvax)).is.true;

        // grab Circle message from logs
        const circleMessage = await avaxCircleIntegration
          .circleTransmitter()
          .then((address) => findCircleMessageInLogs(receipt!.logs, address));
        expect(circleMessage).is.not.null;

        // grab attestation
        const circleAttestation = circleAttester.attestMessage(
          ethers.utils.arrayify(circleMessage!)
        );

        // now grab the Wormhole message
        const wormholeMessage = await avaxCircleIntegration
          .wormhole()
          .then((address) =>
            findWormholeMessageInLogs(
              receipt!.logs,
              address,
              CHAIN_ID_AVAX as number
            )
          );
        expect(wormholeMessage).is.not.null;

        // sign the DepositWithPayload message
        const encodedWormholeMessage = Uint8Array.from(
          guardians.addSignatures(wormholeMessage!, [0])
        );

        // save all of the redeem parameters
        localVariables.circleBridgeMessage = circleMessage!;
        localVariables.circleAttestation = circleAttestation!;
        localVariables.encodedWormholeMessage = encodedWormholeMessage;
      });

      it("Should Redeem Tokens With Relay On Ethereum (Without Native Airdrop)", async () => {
        // create RedeemParameters struct to invoke the target contract with
        const redeemParameters: RedeemParameters = {
          circleBridgeMessage: localVariables.circleBridgeMessage!,
          circleAttestation: localVariables.circleAttestation!,
          encodedWormholeMessage: localVariables.encodedWormholeMessage!,
        };

        // clear the localVariables object
        localVariables = {};

        // grab the token balance before redeeming the transfer
        const balanceBefore = await ethUsdc.balanceOf(avaxWallet.address);
        const relayerBalanceBefore = await ethUsdc.balanceOf(
          ethRelayerWallet.address
        );

        // grab ether balance before redeeming the transfer
        const ethBalanceBefore = await ethWallet.getBalance();
        const ethRelayerBalanceBefore = await ethRelayerWallet.getBalance();

        // fetch the native asset swap quote
        const nativeSwapQuote =
          await ethCircleRelayer.calculateNativeSwapAmountOut(
            ethUsdc.address,
            toNativeTokenAmountAvax
          );
        expect(nativeSwapQuote.eq(0)).is.true;

        // redeem the transfer with the relayer's wallet
        const receipt = await ethCircleRelayer
          .connect(ethRelayerWallet) // change signer to the relayer
          .redeemTokens(redeemParameters)
          .then(async (tx) => {
            const receipt = await tx.wait();
            return receipt;
          })
          .catch((msg) => {
            // should not happen
            console.log(msg);
            return null;
          });
        expect(receipt).is.not.null;

        // parse the wormhole message
        const parsedMessage = await ethWormhole.parseVM(
          redeemParameters.encodedWormholeMessage
        );

        // fetch the Redeem event emitted by the contract
        const event = findRedeemEventInLogs(
          receipt!.logs,
          ethCircleIntegration.address
        );
        expect(event.emitterChainId).to.equal(parsedMessage.emitterChainId);
        expect(event.emitterAddress).to.equal(parsedMessage.emitterAddress);
        expect(event.sequence.toString()).to.equal(
          parsedMessage.sequence.toString()
        );

        // grab the token balance after redeeming the transfer
        const balanceAfter = await ethUsdc.balanceOf(avaxWallet.address);
        const relayerBalanceAfter = await ethUsdc.balanceOf(
          avaxRelayerWallet.address
        );

        // grab ether balance after redeeming the transfer
        const ethBalanceAfter = await ethWallet.getBalance();
        const ethRelayerBalanceAfter = await ethRelayerWallet.getBalance();

        // fetch the relayer fee
        const relayerFee = await avaxCircleRelayer.relayerFee(
          CHAIN_ID_ETH,
          avaxUsdc.address
        );

        // fetch the max swap amount
        const maxSwapAmount = await avaxCircleRelayer.maxNativeSwapAmount(
          avaxUsdc.address
        );

        // determine amount actually swapped with the contract based on the max
        let actualNativeSwapAmount = nativeSwapQuote;
        if (actualNativeSwapAmount > maxSwapAmount) {
          actualNativeSwapAmount = maxSwapAmount;
        }

        // recipient token balance
        expect(
          balanceAfter
            .sub(balanceBefore)
            .eq(amountFromAvax.sub(relayerFee).sub(toNativeTokenAmountAvax))
        ).is.true;

        // relayer token balance
        expect(
          relayerBalanceAfter
            .sub(relayerBalanceBefore)
            .eq(relayerFee.add(toNativeTokenAmountAvax))
        ).is.true;

        // recipient ether balance
        expect(ethBalanceAfter.sub(ethBalanceBefore).eq(actualNativeSwapAmount))
          .is.true;

        // relayer ether balance
        expect(
          ethRelayerBalanceBefore
            .sub(ethRelayerBalanceAfter)
            .gte(actualNativeSwapAmount)
        ).is.true;
      });

      it("Should Transfer Tokens With Relay On Avalanche (Self Redeem)", async () => {
        // create transferTokenWithRelay parameters
        const targetRecipientWallet =
          "0x" + tryNativeToHexString(ethWallet.address, "ethereum");

        // increase allowance
        {
          const receipt = await avaxUsdc
            .approve(avaxCircleRelayer.address, amountFromAvax)
            .then((tx) => tx.wait());
        }

        // grab USDC balance before performing the transfer
        const balanceBefore = await avaxUsdc.balanceOf(avaxWallet.address);

        // call transferTokensWithRelay
        const receipt = await avaxCircleRelayer
          .transferTokensWithRelay(
            avaxUsdc.address,
            amountFromAvax,
            toNativeTokenAmountAvax,
            CHAIN_ID_ETH,
            targetRecipientWallet
          )
          .then(async (tx) => {
            const receipt = await tx.wait();
            return receipt;
          })
          .catch((msg) => {
            // should not happen
            console.log(msg);
            return null;
          });
        expect(receipt).is.not.null;

        // check USDC balance after to confirm the transfer worked
        const balanceAfter = await avaxUsdc.balanceOf(avaxWallet.address);
        expect(balanceBefore.sub(balanceAfter).eq(amountFromAvax)).is.true;

        // grab Circle message from logs
        const circleMessage = await avaxCircleIntegration
          .circleTransmitter()
          .then((address) => findCircleMessageInLogs(receipt!.logs, address));
        expect(circleMessage).is.not.null;

        // grab attestation
        const circleAttestation = circleAttester.attestMessage(
          ethers.utils.arrayify(circleMessage!)
        );

        // now grab the Wormhole message
        const wormholeMessage = await avaxCircleIntegration
          .wormhole()
          .then((address) =>
            findWormholeMessageInLogs(
              receipt!.logs,
              address,
              CHAIN_ID_AVAX as number
            )
          );
        expect(wormholeMessage).is.not.null;

        // sign the DepositWithPayload message
        const encodedWormholeMessage = Uint8Array.from(
          guardians.addSignatures(wormholeMessage!, [0])
        );

        // save all of the redeem parameters
        localVariables.circleBridgeMessage = circleMessage!;
        localVariables.circleAttestation = circleAttestation!;
        localVariables.encodedWormholeMessage = encodedWormholeMessage;
      });

      it("Should Redeem Tokens With Relay On Ethereum (Self Redeem)", async () => {
        // create RedeemParameters struct to invoke the target contract with
        const redeemParameters: RedeemParameters = {
          circleBridgeMessage: localVariables.circleBridgeMessage!,
          circleAttestation: localVariables.circleAttestation!,
          encodedWormholeMessage: localVariables.encodedWormholeMessage!,
        };

        // NOTE: don't clear the local variables, they are used in subsequent tests

        // grab the token balance before redeeming the transfer
        const balanceBefore = await ethUsdc.balanceOf(avaxWallet.address);

        // fetch the native asset swap quote
        const nativeSwapQuote =
          await ethCircleRelayer.calculateNativeSwapAmountOut(
            ethUsdc.address,
            toNativeTokenAmountAvax
          );
        expect(nativeSwapQuote.eq(0)).is.true;

        // redeem the transfer with the recipient's wallet
        const receipt = await ethCircleRelayer
          .connect(ethWallet) // recipients wallet
          .redeemTokens(redeemParameters)
          .then(async (tx) => {
            const receipt = await tx.wait();
            return receipt;
          })
          .catch((msg) => {
            // should not happen
            console.log(msg);
            return null;
          });
        expect(receipt).is.not.null;

        // parse the wormhole message
        const parsedMessage = await ethWormhole.parseVM(
          redeemParameters.encodedWormholeMessage
        );

        // fetch the Redeem event emitted by the contract
        const event = findRedeemEventInLogs(
          receipt!.logs,
          ethCircleIntegration.address
        );
        expect(event.emitterChainId).to.equal(parsedMessage.emitterChainId);
        expect(event.emitterAddress).to.equal(parsedMessage.emitterAddress);
        expect(event.sequence.toString()).to.equal(
          parsedMessage.sequence.toString()
        );

        // grab the token balance after redeeming the transfer
        const balanceAfter = await ethUsdc.balanceOf(avaxWallet.address);

        // The recipient should get the full token amount, since the recipient's
        // wallet was used to redeem the transfer.
        expect(balanceAfter.sub(balanceBefore).eq(amountFromAvax)).is.true;
      });

      it("Should Not Redeem a Transfer More Than Once", async () => {
        // Reuse the RedeemParameters from the previous test to try to redeem again
        const redeemParameters: RedeemParameters = {
          circleBridgeMessage: localVariables.circleBridgeMessage!,
          circleAttestation: localVariables.circleAttestation!,
          encodedWormholeMessage: localVariables.encodedWormholeMessage!,
        };

        // clear the localVariables object
        localVariables = {};

        // grab the balance before redeeming the transfer
        const balanceBefore = await ethUsdc.balanceOf(ethWallet.address);

        // try to redeem the transfer again
        let failed: boolean = false;
        try {
          const receipt = await ethCircleRelayer
            .redeemTokens(redeemParameters)
            .then(async (tx) => {
              const receipt = await tx.wait();
              return receipt;
            });
        } catch (e: any) {
          expect(e.error.reason, "execution reverted: message already consumed")
            .to.be.equal;
          failed = true;
        }

        // confirm that the call failed
        expect(failed).is.true;

        // confirm expected balance change
        const balanceAfter = await ethUsdc.balanceOf(ethWallet.address);
        expect(balanceAfter.eq(balanceBefore)).is.true;
      });
    });
  });
});
