#!/usr/bin/env sh

if [ $# -ne 2 ]; then
    echo "Please specify the tag as the second parameter"
    exit 1
fi

if [[ "$1" == "--testnet" ]]; then
    source testnet/env.testnet.sh
    kubectl apply -f testnet/circle-relayer.configmap.yaml
    kubetpl render ./circle-relayer.deployment.yaml -i testnet/staging.env -s TAG="$2" | kubectl apply -f -
    kubectl apply -f circle-relayer.service.yaml
elif [[ "$1" == "--mainnet" ]]; then
    source mainnet/env.mainnet.sh
    kubectl apply -f mainnet/circle-relayer.configmap.yaml
    kubetpl render ./circle-relayer.deployment.yaml -i mainnet/production.env -s TAG="$2" | kubectl apply -f -
    kubectl apply -f circle-relayer.service.yaml
else
    echo "Invalid argument. Please use --testnet or --mainnet. and the tag as a positional parameter. Example: ./deploy.sh --testnet 2.0.1"
fi

