#!/usr/bin/env bash

# if [ $# -ne 2 && $# -ne 3]; then
#     echo "Invalid argument. Example: ./build-image.sh DEV <AWS_ACCOUNT>"
#     exit 1
# fi

AWS_PROFILE=$1
AWS_ACCOUNT=$2

if [ -z "$3" ]; then
    TAG=$(npm run version --silent)
else
    TAG=$3
fi
set -e
aws ecr get-login-password --region us-east-2 --profile $AWS_PROFILE | docker login --username AWS --password-stdin $AWS_ACCOUNT.dkr.ecr.us-east-2.amazonaws.com
docker build --platform=linux/amd64 -t $AWS_ACCOUNT.dkr.ecr.us-east-2.amazonaws.com/circle-relayer:$TAG --secret id=npmrc,src=$HOME/.npmrc .
docker push $AWS_ACCOUNT.dkr.ecr.us-east-2.amazonaws.com/circle-relayer:$TAG

set +e

