## Instructions for sending test message on CCTP testnet

- **Install depedencies**: Make sure to run `cd evm && yarn`
- **Build types**: `make build`
- **Setup env variables**: Copy `.env.example` into `.env` (Note: Add `PRIVATE_KEY` in `.env` or through cmd)
- **Update env acc to source and target chain**: Update source USDC address and target chainId
- Make sure your wallet has sufficient native funds (eg AVAX) and USDC (eg USDC on Avalanche Fuji) in source chain
- **Load env variable in context**: `source .env && source ./env/testnet/avax.env`
- **Send test transfer**: `shell-scripts/run_test_transfer.sh`