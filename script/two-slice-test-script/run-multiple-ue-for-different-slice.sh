#!/bin/bash

########################################################
# Script for running multiple UE for different slices
#
# Usage:
#   ./run-multiple-ue-for-different-slice.sh
#
# Description:
#   This script runs two instances of free-ran-ue with
#   different configurations to simulate multiple UE for different slices.
########################################################

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="${SCRIPT_DIR}/../../"

cd "$ROOT_DIR"

# Trap SIGINT (Ctrl+C) to kill background processes
trap "trap - SIGTERM && kill -- -$$" SIGINT SIGTERM EXIT

echo "Starting UE for Slice 1..."
./build/free-ran-ue ue -c config/ue1.yaml -n 90 &
PID1=$!

# echo "Waiting for Slice 1 UEs to initialize tunnel devices..."
# sleep 30

echo "Starting UE for Slice 2..."
./build/free-ran-ue ue -c config/ue2.yaml -n 10 &
PID2=$!

echo "UEs started. Press Ctrl+C to stop."

# Wait for both processes
wait $PID1 $PID2
