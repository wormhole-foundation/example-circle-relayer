#!/usr/bin/env sh

if [ $# -ne 2 ]; then
    echo "Please specify the tag as the second parameter"
    exit 1
fi

if [[ "$1" == "--testnet" ]]; then
    kubectl apply -f testnet/circle-oracle.configmap.yaml
    kubetpl render ./circle-oracle.deployment.yaml -s AWS_ACCOUNT="$AWS_ACCOUNT_STAGING" -s TAG="$2" | kubectl apply -f -
elif [[ "$1" == "--mainnet" ]]; then
    kubectl apply -f mainnet/circle-oracle.configmap.yaml
    kubetpl render ./circle-oracle.deployment.yaml -s AWS_ACCOUNT="$AWS_ACCOUNT_PRODUCTION" -s TAG="$2" | kubectl apply -f -
else
    echo "Invalid argument. Please use --testnet or --mainnet. and the tag as a positional parameter. Example: ./deploy.sh --testnet 2.0.1"
    exit 1
fi

kubectl apply -f circle-oracle.service.yaml