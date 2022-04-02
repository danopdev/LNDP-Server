# Local Network Document Provider (Server) #

I needed a simple and fast mechanism to copy files between my smartphone and my laptop.
I tried to use FTP or SAMBA but there was always something that didn't work or it was too slow.

The comunication is done over HTTP and on Android side it use Document Provider API.

This is the server (linux) part. Check [LNDP-Android](https://github.com/danopdev/LNDP-Android) (the smartphone application) for more details.

The server expose it's presence using Bonjour protocol.

## Install ##

Clone this repository:
```
git clone git@github.com:danopdev/LNDP-Server.git
```

Install npm packages
```
cd LNDP-Server
npm install
```

## Configuration ##

Copy 'config.json.example' to 'config.json' and edit it.
You can keep all default values except the 'root' path.

* servicePort: specity the port it serves files
* authTokens:
  * null: it will allow communication with all devices
  * array if strings of allowed tokens (ex: ["1234"])
* readOnly: allow read-write or read-only access to PC files
* root: the folder the will be exposed
* thumb: options for the thumbnails generated on the fly (image only for now)
  * size: maximum width / height
  * quality: jpeg quality

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

Try to use HTTPS.
