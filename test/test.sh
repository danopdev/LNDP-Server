#!/bin/bash

#setup
rm -rf public tmp
mkdir public tmp

cd ..
node server.js ./test/config-test.json >test/tmp/server.log 2>&1 &
SERVERPID=$!
echo "Wait server to start"
sleep 2
cd test

#setup test files
mkdir -p public/a public/Noël
cp file_small* public/
cp file_small* public/Noël

echo -ne "Test: /queryDocument token"
curl -k "http://localhost:1800/queryDocument?path=/" --output tmp/output.txt >>tmp/test.log 2>&1
[ -s tmp/output.txt ] && echo " => FAILED" || echo " => OK"

echo -ne "Test: /queryDocument /"
curl -H "Authorization: Bearer 1234" -k "http://localhost:1800/queryDocument?path=/" --output tmp/output.txt 1>tmp/test.log 2>&1
grep -q '"id":"/","name":"/","isdir":true' tmp/output.txt && grep -q '"type":"application/x-directory","thumb":false' tmp/output.txt && echo " => OK" || echo " => FAILED"

echo -ne "Test: /queryDocument /a"
curl -H "Authorization: Bearer 1234" -k "http://localhost:1800/queryDocument?path=/a" --output tmp/output.txt 1>tmp/test.log 2>&1
grep -q '"id":"/a","name":"a","isdir":true' tmp/output.txt && grep -q '"type":"application/x-directory","thumb":false' tmp/output.txt && echo " => OK" || echo " => FAILED"

echo -ne "Test: /queryDocument /file_small.bin"
curl -H "Authorization: Bearer 1234" -k "http://localhost:1800/queryDocument?path=/file_small.bin" --output tmp/output.txt 1>tmp/test.log 2>&1
grep -q '"id":"/file_small.bin","name":"file_small.bin","isdir":false,"isreadonly":false,"size":286' tmp/output.txt && grep -q '"thumb":false' tmp/output.txt && echo " => OK" || echo " => FAILED"

echo -ne "Test: /queryDocument /Noël/file_small.jpg"
curl -H "Authorization: Bearer 1234" -k "http://localhost:1800/queryDocument?path=/No%C3%ABl/file_small.jpg" --output tmp/output.txt 1>tmp/test.log 2>&1
grep -q '"id":"/Noël/file_small.jpg","name":"file_small.jpg","isdir":false' tmp/output.txt && grep -q '"size":152157' tmp/output.txt && grep -q '"type":"image/jpeg","thumb":true' tmp/output.txt && echo " => OK" || echo " => FAILED"

echo -ne "Test: /queryChildDocuments token"
curl -k "http://localhost:1800/queryChildDocuments?path=/" --output tmp/output.txt >>tmp/test.log 2>&1
[ -s tmp/output.txt ] && echo " => FAILED" || echo " => OK"

echo -ne "Test: /queryChildDocuments /"
curl -H "Authorization: Bearer 1234" -k "http://localhost:1800/queryChildDocuments?path=/" --output tmp/output.txt >>tmp/test.log 2>&1
grep -q '"id":"/Noël","name":"Noël","isdir":true' tmp/output.txt && grep -q '"id":"/file_small.txt","name":"file_small.txt","isdir":false,"isreadonly":false,"size":26' tmp/output.txt && echo " => OK" || echo " => FAILED"

echo -ne "Test: /queryChildDocuments /Noël"
curl -H "Authorization: Bearer 1234" -k "http://localhost:1800/queryChildDocuments?path=/No%C3%ABl" --output tmp/output.txt >>tmp/test.log 2>&1
grep -q '"id":"/Noël/file_small.bin","name":"file_small.bin","isdir":false' tmp/output.txt && echo " => OK" || echo " => FAILED"

echo -ne "Test: /documentCreate token"
curl -k "http://localhost:1800/documentCreate?path=/&name=b.bin" --output tmp/output.txt >>tmp/test.log 2>&1
[ -s tmp/output.txt ] && echo " => FAILED" || echo " => OK"

echo -ne "Test: /documentCreate /b.bin"
curl -H "Authorization: Bearer 1234" -k "http://localhost:1800/documentCreate?path=/&name=b.bin" --output tmp/output.txt >>tmp/test.log 2>&1
[ -f public/b.bin ] && grep -q '{"id":"/b.bin"}' tmp/output.txt && echo " => OK" || echo " => FAILED"

echo -ne "Test: /documentCreate /Noël/b.bin"
curl -H "Authorization: Bearer 1234" -k "http://localhost:1800/documentCreate?path=/No%C3%ABl&name=b.bin" --output tmp/output.txt >>tmp/test.log 2>&1
[ -f public/Noël/b.bin ] && grep -q '{"id":"/Noël/b.bin"}' tmp/output.txt && echo " => OK" || echo " => FAILED"

echo -ne "Test: /documentCreate /a/noël.bin"
curl -H "Authorization: Bearer 1234" -k "http://localhost:1800/documentCreate?path=/a&name=no%C3%ABl.bin" --output tmp/output.txt >>tmp/test.log 2>&1
[ -f public/a/noël.bin ] && grep -q '{"id":"/a/noël.bin"}' tmp/output.txt && echo " => OK" || echo " => FAILED"

echo -ne "Test: /documentCreate /c (dir)"
curl -H "Authorization: Bearer 1234" -k "http://localhost:1800/documentCreate?path=/&name=c&isdir=1" --output tmp/output.txt >>tmp/test.log 2>&1
[ -d public/c ] && grep -q '{"id":"/c"}' tmp/output.txt && echo " => OK" || echo " => FAILED"

echo -ne "Test: /documentCreate /c when it exists as directory"
curl -H "Authorization: Bearer 1234" -k "http://localhost:1800/documentCreate?path=/&name=c&isdir=0" --output tmp/output.txt >>tmp/test.log 2>&1
grep -q 'Internal Server Error' tmp/output.txt && echo " => OK" || echo " => FAILED"

echo -ne "Test: /documentRename token"
curl -k "http://localhost:1800/documentRename?path=/c&newname=d" --output tmp/output.txt >>tmp/test.log 2>&1
[ -s tmp/output.txt ] && echo " => FAILED" || echo " => OK"

echo -ne "Test: /documentRename /c to /d"
curl -H "Authorization: Bearer 1234" -k "http://localhost:1800/documentRename?path=/c&newname=d" --output tmp/output.txt >>tmp/test.log 2>&1
[ -d public/d ] && grep -q '{"id":"/d"}' tmp/output.txt && echo " => OK" || echo " => FAILED"

echo -ne "Test: /documentRename /d to /a"
curl -H "Authorization: Bearer 1234" -k "http://localhost:1800/documentRename?path=/c&newname=a" --output tmp/output.txt >>tmp/test.log 2>&1
grep -q 'Internal Server Error' tmp/output.txt && echo " => OK" || echo " => FAILED"

echo -ne "Test: /documentRename /d to /file_small.jpg"
curl -H "Authorization: Bearer 1234" -k "http://localhost:1800/documentRename?path=/c&newname=file_small.jpg" --output tmp/output.txt >>tmp/test.log 2>&1
grep -q 'Internal Server Error' tmp/output.txt && [ -s public/file_small.jpg ] && echo " => OK" || echo " => FAILED"

echo -ne "Test: /documentRead token"
curl -k "http://localhost:1800/documentRead?path=/file_small.jpg&size=500000" --output tmp/output.txt >>tmp/test.log 2>&1
[ -s tmp/output.txt ] && echo " => FAILED" || echo " => OK"

echo -ne "Test: /documentRead /file_small.jpg size=500000"
curl -H "Authorization: Bearer 1234" -k "http://localhost:1800/documentRead?path=/file_small.jpg&size=500000" --output tmp/output.bin >>tmp/test.log 2>&1
diff public/file_small.jpg tmp/output.bin >>tmp/test.log 2>&1 && echo " => OK" || echo " => FAILED"

echo -ne "Test: /documentRead /file_small.jpg size=100000 + size=100000"
curl -H "Authorization: Bearer 1234" -k "http://localhost:1800/documentRead?path=/file_small.jpg&offset=0&size=100000" --output tmp/output.1.bin >>tmp/test.log 2>&1
curl -H "Authorization: Bearer 1234" -k "http://localhost:1800/documentRead?path=/file_small.jpg&offset=100000&size=100000" --output tmp/output.2.bin >>tmp/test.log 2>&1
cat tmp/output.1.bin tmp/output.2.bin > tmp/output.bin
diff public/file_small.jpg tmp/output.bin >>tmp/test.log 2>&1 && echo " => OK" || echo " => FAILED"

echo -ne "Test: /documentAppend token"
filename=file_small.jpg_00
filesize=`wc -c $filename | cut -f1 -d' '`
curl -k -F "block=@$filename" "http://localhost:1800/documentAppend?path=/a/no%C3%ABl.bin" --output tmp/output.txt >>tmp/test.log 2>&1
[ -s public/a/noël.bin ] && echo " => FAILED" || echo " => OK"

echo -ne "Test: /documentAppend /a/noël.bin"
fileoffset=0
for filename in `ls file_small.jpg_* | sort`; do
    filesize=`wc -c $filename | cut -f1 -d' '`
    curl -H "Authorization: Bearer 1234" -k -F "block=@$filename" "http://localhost:1800/documentAppend?path=/a/no%C3%ABl.bin" --output tmp/output.txt >>tmp/test.log 2>&1
    fileoffset=$(($fileoffset + $filesize))
done
diff file_small.jpg public/a/noël.bin >>tmp/test.log 2>&1 && echo " => OK" || echo " => FAILED"

echo -ne "Test: /documentReadThumb token"
curl -k "http://localhost:1800/documentReadThumb?path=/file_small.jpg" --output tmp/output.bin >>tmp/test.log 2>&1
[ -s tmp/output.bin ] && echo " => FAILED" || echo " => OK"

echo -ne "Test: /documentReadThumb file_small.bin"
curl -H "Authorization: Bearer 1234" -k "http://localhost:1800/documentReadThumb?path=/file_small.bin" --output tmp/output.txt >>tmp/test.log 2>&1
grep -q 'Internal Server Error' tmp/output.txt && echo " => OK" || echo " => FAILED"

echo -ne "Test: /documentReadThumb file_small.jpg"
curl -H "Authorization: Bearer 1234" -k "http://localhost:1800/documentReadThumb?path=/file_small.jpg" --output tmp/output.bin >>tmp/test.log 2>&1
file tmp/output.bin >tmp/output.txt 2>&1
[ -s tmp/output.bin ] && grep -q 'JPEG' tmp/output.txt && echo " => OK" || echo " => FAILED"

echo -ne "Test: /documentRename /a/noël.bin to /d/test.bin"
curl -H "Authorization: Bearer 1234" -k "http://localhost:1800/documentRename?path=/a/no%C3%ABl.bin&newname=/d/test.bin" --output tmp/output.txt >>tmp/test.log 2>&1
[ -s public/d/test.bin ]  && echo " => OK" || echo " => FAILED"

echo -ne "Test: publish lndp"
avahi-browse -atpr 2>/dev/null | grep "${HOSTNAME}-" | grep 1800 >>tmp/test.log 2>&1 && echo " => OK" || echo " => FAILED"

#cleanup
kill $SERVERPID
#rm -rf public backup tmp
