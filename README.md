# Local Network Document Provider (Server) #

I needed a simple and fast mechanism to copy files between my smartphone and my laptop.
I tried to use FTP or SAMBA but there was always something that didn't work or it was too slow.

The comunication is done over HTTP or HTTPS and on Android side it use Document Provider API.

This is the server (linux) part. Check [LNDP-Android](https://github.com/danopdev/LNDP-Android) (the smartphone application) for more details.

The server expose it's presence using Bonjour protocol.

## Install ##

> **_NOTE:_** Tested with node 14 & 16.

Clone this repository:
```
git clone git@github.com:danopdev/LNDP-Server.git
```

Install npm packages
```
cd LNDP-Server
npm install
```

> **_NOTE:_** you can safely remove the test folder (it contains non-regression tests scripts and data files)

## Configuration ##

Copy 'config.json.example' to 'config.json' and edit it.
You can keep all default values except the 'root' path.

* servicePort: specity the port it serves files
* readOnly: allow read-write or read-only access to PC files
* root: the folder the will be exposed

* authTokens:
  * null: it will allow communication with all devices
  * array if strings of allowed tokens (ex: ["1234"])

I you want to see the token of you device you can run the sever in debug mode and check "Invalid token" traces:

```
DEBUG=lndp ./start.sh
    lndp Invalid token: 1234
```

* thumb: options for the thumbnails generated on the fly (image only for now)
  * size: maximum width / height
  * quality: jpeg quality
* ssl: use to encrypt the communication with self signed certificate
  * enabled: true / false
  * keyFile: path to the key file (if ssl enabled)
  * certFile: path to the certificate file (if ssl enabled)

To generate a self signed certicate you can use the following command:
```
openssl req -nodes -new -x509 -keyout server.key -out server.cert
```
> **_NOTE:_** don't put a password.

## Run the server ##

Normal mode:
```
./start.sh
```

Debug mode:
```
DEBUG=lndp ./start.sh
```

## TODO ##

* Try to make it compatible with Windows
