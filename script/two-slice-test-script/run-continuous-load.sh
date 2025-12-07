#!/bin/bash

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="${SCRIPT_DIR}/../../"

echo -e "${GREEN}=== Continuous Load Experiment Runner ===${NC}"

# 1. Check Root
if [ "$EUID" -ne 0 ]; then 
  echo -e "${RED}Please run as root (sudo)${NC}"
  exit 1
fi

# 2. Check Namespaces
if ! ip netns list | grep -q "free-ue-ns"; then
    echo -e "${RED}Error: free-ue-ns namespace not found.${NC}"
    echo "Please run 'make ns-up' in free-ran-ue directory first."
    exit 1
fi

# 3. Run Python Experiment Runner
echo "Starting experiment logic..."
cd "$SCRIPT_DIR"
# Use the configured python environment if available, else python3
PYTHON_CMD="/home/ubuntu/.venv/bin/python"
if [ ! -f "$PYTHON_CMD" ]; then
    PYTHON_CMD="python3"
fi

$PYTHON_CMD experiment_runner.py

# 4. Run Analysis
echo "Generating report..."
$PYTHON_CMD analyze_continuous.py

echo -e "${GREEN}Experiment finished.${NC}"
