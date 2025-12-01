#!/bin/bash

########################################################
# Script for inserting subscribers for two slices
#
# Usage:
#   ./insert_subscribers.sh <count1> <count2>
#
# Description:
#   This script inserts <count1> subscribers for slice 1
#   and <count2> subscribers for slice 2, ensuring sequential IMSIs.
########################################################

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

FREE5GC_CONSOLE_BASE_URL='http://127.0.0.1:5000'

FREE5GC_CONSOLE_LOGIN_DATA_FILE="${SCRIPT_DIR}/free5gc-console-login-data.json"
DATA_FILE_SLICE1="${SCRIPT_DIR}/free5gc-console-subscriber-data.json"
DATA_FILE_SLICE2="${SCRIPT_DIR}/free5gc-console-subscriber-data-slice2.json"

Usage() {
    echo "Usage: $0 <count1> <count2>"
    echo "  <count1>: Number of subscribers for Slice 1"
    echo "  <count2>: Number of subscribers for Slice 2"
    exit 1
}

free5gc_console_login() {
    local token=$(curl -s -X POST $FREE5GC_CONSOLE_BASE_URL/api/login -H "Content-Type: application/json" -d @$FREE5GC_CONSOLE_LOGIN_DATA_FILE | jq -r '.access_token')
    if [ -z "$token" ] || [ "$token" = "null" ]; then
        echo "Failed to get token!"
        return 1
    fi

    echo "$token"
    return 0
}

insert_subscriber() {
    local file=$1
    local token=$2
    
    local imsi=$(jq -r '.ueId' "$file" | sed 's/imsi-//')
    local plmn_id=$(jq -r '.plmnID' "$file")

    if curl -s --fail -X POST $FREE5GC_CONSOLE_BASE_URL/api/subscriber/imsi-$imsi/$plmn_id -H "Content-Type: application/json" -H "Token: $token" -d @$file; then
        echo "Subscriber imsi-$imsi created successfully!"
    else
        echo "Failed to create subscriber imsi-$imsi!"
    fi

    local new_imsi=$((imsi + 1))
    jq --tab --arg new_ue_id "imsi-$new_imsi" '.ueId = $new_ue_id' "$file" > "${file}.tmp" && mv "${file}.tmp" "$file"
}

main() {
    if [ $# -ne 2 ]; then
        Usage
    fi

    local count1=$1
    local count2=$2

    local token=$(free5gc_console_login)
    if [ -z "$token" ]; then
        echo "Failed to get token!"
        return 1
    fi

    echo "Inserting $count1 subscribers for Slice 1..."
    for i in $(seq 1 $count1); do
        insert_subscriber "$DATA_FILE_SLICE1" "$token"
    done

    # Sync IMSI from Slice 1 file to Slice 2 file to ensure continuity
    local next_imsi=$(jq -r '.ueId' "$DATA_FILE_SLICE1")
    jq --tab --arg next_imsi "$next_imsi" '.ueId = $next_imsi' "$DATA_FILE_SLICE2" > "${DATA_FILE_SLICE2}.tmp" && mv "${DATA_FILE_SLICE2}.tmp" "$DATA_FILE_SLICE2"

    echo "Inserting $count2 subscribers for Slice 2..."
    for i in $(seq 1 $count2); do
        insert_subscriber "$DATA_FILE_SLICE2" "$token"
    done

    # Reset both files to default IMSI (optional, based on original script behavior)
    echo "Resetting subscriber data files to default IMSI..."
    jq --tab '.ueId = "imsi-208930000000001"' "$DATA_FILE_SLICE1" > "${DATA_FILE_SLICE1}.tmp" && mv "${DATA_FILE_SLICE1}.tmp" "$DATA_FILE_SLICE1"
    jq --tab '.ueId = "imsi-208930000000001"' "$DATA_FILE_SLICE2" > "${DATA_FILE_SLICE2}.tmp" && mv "${DATA_FILE_SLICE2}.tmp" "$DATA_FILE_SLICE2"
}

main "$@"
