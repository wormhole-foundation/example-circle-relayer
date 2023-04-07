#! /bin/sh

kubectl delete secret circle-relayer-redis --ignore-not-found --namespace=circle-relayer

echo ${REDIS_CLUSTER_ENDPOINTS}

kubectl create secret generic circle-relayer-redis \
    --from-literal=REDIS_CLUSTER_ENDPOINTS=${REDIS_CLUSTER_ENDPOINTS} \
    --from-literal=REDIS_USERNAME=${REDIS_USERNAME} \
    --from-literal=REDIS_PASSWORD=${REDIS_PASSWORD} \
    --from-literal=REDIS_TLS=true \
    --namespace=circle-relayer
