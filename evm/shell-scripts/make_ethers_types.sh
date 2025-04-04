#!/bin/bash

SRC=$(dirname $0)/../out
DST=$(dirname $0)/../ts/src/ethers-contracts

typechain --target=ethers-v5 --out-dir=$DST $SRC/*.sol/*.json
