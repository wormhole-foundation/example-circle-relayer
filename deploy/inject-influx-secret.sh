#! /bin/sh

kubectl delete secret circle-relayer-influx --ignore-not-found --namespace=circle-relayer

echo ${INFLUXDB_URL}

kubectl create secret generic circle-relayer-influx \
    --from-literal=INFLUXDB_URL=${INFLUXDB_URL} \
    --from-literal=INFLUXDB_ORG=${INFLUXDB_ORG} \
    --from-literal=INFLUXDB_BUCKET=${INFLUXDB_BUCKET} \
    --from-literal=INFLUXDB_TOKEN=${INFLUXDB_TOKEN} \
    --namespace=circle-relayer
