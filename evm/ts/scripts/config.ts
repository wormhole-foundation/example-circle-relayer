
export type SupportedChainId = 2 | 6 | 23;

export interface Config {
    deployedContracts: Record<SupportedChainId, string>;
    acceptedTokens: {
        USDC: {
            tokenInfo: Record<SupportedChainId, {
                address: string;
                nativeSwapRate: string;
                maxNativeSwapAmount: string;
            }>;
            outboundRelayerFees: Record<SupportedChainId, string>;
        }
    }
}