#! /bin/sh

kubectl delete secret circle-relayer-key --ignore-not-found --namespace=circle-relayer

kubectl create secret generic circle-relayer-key \
    --from-literal=EVM_PRIVATE_KEY=${EVM_PRIVATE_KEY} \
    --namespace=circle-relayer
