#! /bin/sh

kubectl delete secret circle-relayer-key --ignore-not-found --namespace=circle-relayer
kubectl delete secret circle-relayer-owner-key --ignore-not-found --namespace=circle-relayer

kubectl create secret generic circle-relayer-key \
    --from-literal=ETH_PRIVATE_KEY=${ETH_PRIVATE_KEY} \
    --from-literal=AVAX_PRIVATE_KEY=${AVAX_PRIVATE_KEY} \
    --namespace=circle-relayer

kubectl create secret generic circle-relayer-owner-key \
    --from-literal=AVAX_OWNER_PRIVATE_KEY=${AVAX_OWNER_PRIVATE_KEY} \
    --from-literal=ETH_OWNER_PRIVATE_KEY=${ETH_OWNER_PRIVATE_KEY} \
    --namespace=circle-relayer