#! /bin/sh

kubectl delete secret circle-relayer-key --ignore-not-found --namespace=circle-relayer
kubectl delete secret circle-relayer-owner-key --ignore-not-found --namespace=circle-relayer

kubectl create secret generic circle-relayer-key \
    --from-literal=EVM_PRIVATE_KEY=${EVM_PRIVATE_KEY} \
    --namespace=circle-relayer

kubectl create secret generic circle-relayer-owner-key \
    --from-literal=AVAX_PRICE_ASSISTANT_KEY=${AVAX_PRICE_ASSISTANT_KEY} \
    --from-literal=ETH_PRICE_ASSISTANT_KEY=${ETH_PRICE_ASSISTANT_KEY} \
    --from-literal=ARBITRUM_PRICE_ASSISTANT_KEY=${ARBITRUM_PRICE_ASSISTANT_KEY} \
    --from-literal=OPTIMISM_PRICE_ASSISTANT_KEY=${OPTIMISM_PRICE_ASSISTANT_KEY} \
    --namespace=circle-relayer
