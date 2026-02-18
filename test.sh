#!/bin/bash
PORT="${CODE_PET_PORT:-31425}"
EVENT="${1:-wake}"

curl -s -X POST "http://127.0.0.1:${PORT}/event" \
  -H "Content-Type: application/json" \
  -d "{\"event\":\"${EVENT}\"}"
echo
