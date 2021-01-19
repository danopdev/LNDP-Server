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
    echo -ne "$testfile: "
    bash $testfile
    [ $? -eq 0 ] && echo " => SUCCESS" || echo " => FAILED"
done

cleanup
