#! /bin/sh

kubectl delete secret circle-relayer-db --ignore-not-found --namespace=circle-relayer

kubectl create secret generic circle-relayer-db \
    --from-literal=MONGO_URI=${MONGO_URI} \
    --from-literal=MONGO_NAME=${MONGO_NAME} \
    --namespace=circle-relayer
