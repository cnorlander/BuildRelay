#!/bin/bash

echo "Starting worker processes..."
NUM_WORKERS=${NUM_WORKERS:-1}

for i in $(seq 1 $NUM_WORKERS); do
  python worker.py &
done

wait
