#!/bin/bash

cleanup() {
    rm -rf public backup tmp
}


setup() {
    cleanup
    mkdir public backup tmp
}


for testfile in test_*.sh; do
    setup
    echo "File: $testfile"
    bash $testfile
done

cleanup
