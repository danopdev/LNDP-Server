#!/bin/bash

#setup
rm -rf public backup tmp
mkdir public backup tmp

cd ..
node server.js ./test/config-test.json &
SERVERPID=$!
sleep 5
cd test


#cleanup
kill $SERVERPID
rm -rf public backup tmp
