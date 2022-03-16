//const https = require('https');
const express = require('express');
const multer  = require('multer');
const fs = require('fs');
const os = require('os');
const fsPath = require('path');
const sharp = require('sharp');
const md5lib = require('md5');
const mimeTypes = require('mime-types');
const ciao = require("@homebridge/ciao").getResponder();


const upload = multer({ storage: multer.memoryStorage() });
const restApp = express();



var backup = {
    items: [],

    init() {
        setInterval(this.cleanUp.bind(this), config.backup.checkDeadUploadPeriod * 1000);
    },

    cleanUp() {
        try {
            const now = Math.floor(Date.now() / 1000);

            Object.keys(this.items).forEach(key => {
                const item = this.items[key];
                if ((now - item.lastModificationTime) > config.backup.maxUploadTime) {
                    console.log("[backupCleanUp] Delete id:", key);
                    this.remove(key);
                }
            });
        } catch(e) {
            console.log(e);
        }
    },

    remove(key) {
        if (this.hasKey(key)) {
            delete this.items[key];
        }
    },

    hasKey(key) {
        return key in this.items;
    },

    add( path, size, md5, buffer ) {
        var uploadInfo = {
            path: path,
            size: size,
            md5: md5,
            data: buffer,
            lastModificationTime: Math.floor(Date.now() / 1000),

            update( buffer ) {
                this.data = Buffer.concat( [ this.data, buffer ] );
                this.lastModificationTime = Math.floor(Date.now() / 1000);
            }
        }

        this.items[path] = uploadInfo;
        return uploadInfo;
    },

    upload( res, path, size, offset, md5, buffer ) {
        if (size < 0 || offset < 0 || !path.startsWith('/') || path.indexOf('..') >= 0) {
            res.sendStatus(500);
            return;
        }

        const fullPath = joinPath(backupRoot, path);

        fs.stat(fullPath, (err, stat) => {
            if (!err) {
                this.remove(path);
                res.sendStatus(409);
                return;
            }

            var uploadInfo;
            if (offset > 0) {
                uploadInfo = this.items[path];
                if (!uploadInfo || uploadInfo.size != size || uploadInfo.md5 != md5 || uploadInfo.data.length != offset) {
                    res.sendStatus(500);
                    return;
                }

                uploadInfo.update(buffer);
            } else {
                uploadInfo = this.add( path, size, md5, buffer );
            }

            if (uploadInfo.data.length > size) {
                this.remove(path);
                res.sendStatus(500);
                return;
            }

            if (uploadInfo.data.length < size) {
                res.sendStatus(200);
                return;
            }

            this.remove(path);

            const md5Buffer = md5lib(uploadInfo.data);
            if (md5 != md5Buffer) {
                res.sendStatus(200);
                return;
            }

            fs.mkdir(fsPath.dirname(fullPath), { recursive: true }, (err) => {
                if (err) {
                    res.sendStatus(500);
                    return;
                }

                fs.writeFile(fullPath, uploadInfo.data, "binary", (err) => {
                    if (err) {
                        res.sendStatus(500);
                    } else {
                        res.sendStatus(200);
                    }
                })
            })
        })
    }
}



function joinPath( left, right ) {
    if ( left.endsWith('/') && right.startsWith('/') ) {
        return left + right.substring(1);
    }

    if ( left.endsWith('/') || right.startsWith('/') ) {
        return left + right;
    }

    return left + '/' + right;
}



function checkAuthenticateToken(req, res, next) {
    try {
        if (config.authTokens) {
            const authHeader = req.headers['authorization'];
            const token = authHeader && authHeader.split(' ')[1];
            if (token == null) {
                res.sendStatus(204);
                return;
            }

            console.log("Token:", token)
            if (!config.authTokens.includes(token)) {
                res.sendStatus(403);
                return;
            }
        }

        next();
    } catch(e) {
        res.sendStatus(500);
        console.log(e);
    }
}


/**
 * API: POST /backup
 *   path: url encoded, must start with '/' and must not contains '..'
 *   size: full path size (>= 0)
 *   offset: block offset (>= 0)
 *   md5: final file content md5
 *   block: file data block
 */
restApp.post('/backup', checkAuthenticateToken, upload.single('block'), (req, res) => {
    try {
        backup.upload( res, decodeURIComponent(req.body.path), parseInt(req.body.size), parseInt(req.body.offset), req.body.md5, req.file.buffer );
    } catch(e) {
        res.sendStatus(500);
        console.log(e);
    }
})



function queryInformations( fullPaths ) {
    const lenRoot = lndpRoot.length;
    var output = [];

    fullPaths.forEach((fullPath, i) => {
        const stat = fs.statSync(fullPath);
        var mimeType = 'application/octet-stream';

        if (stat.isDirectory()) {
            mimeType = 'application/x-directory';
        } else {
            try {
                var mimeType_ = mimeTypes.lookup(fullPath);
                if (mimeType_ !== false) {
                    mimeType = mimeType_;
                }
            } catch(e) {

            }
        }

        const id = fullPath.substring(lenRoot);
        if ('/' == id) {
            name = id;
        } else {
            name = id.split('/').pop();
        }

        try {
            fs.accessSync(fullPath, fs.constants.R_OK);

            var isReadOnly = true;
            try {
                fs.accessSync(fullPath, fs.constants.R_OK);
                isReadOnly = false;
            } catch(e) {
            }

            output.push( {
                'id': id,
                'name': name,
                'isdir' : stat.isDirectory(),
                'isreadonly': isReadOnly,
                'size': stat.size,
                'date': stat.mtimeMs,
                'type': mimeType,
                'thumb': mimeType == 'image/jpeg'
            } )
        } catch(e) {
        }
    })

    return output
}



/**
 * API: GET /lndp/queryChildDocuments
 *   path: must start with '/' and must not contains '..'
 */
restApp.get('/lndp/queryChildDocuments', checkAuthenticateToken, (req, res) => {
    try {
        const path = req.query.path;

        if (!path.startsWith('/') || path.indexOf('..') >= 0) {
            res.sendStatus(500);
            return;
        }

        const fullPath = joinPath(lndpRoot, path);
        const stat = fs.statSync(fullPath);

        if (!stat.isDirectory()) {
            res.sendStatus(204);
            return;
        }

        fs.readdir(fullPath, (err, files) => {
            var items = [];
            files.forEach(file => {
                items.push( joinPath(fullPath, file) );
            })
            res.send(queryInformations(items));
        })
    } catch(e) {
        res.sendStatus(500);
        console.log(e);
    }
})



/**
 * API: GET /lndp/queryDocument
 *   path: must start with '/' and must not contains '..'
 */
restApp.get('/lndp/queryDocument', checkAuthenticateToken, (req, res) => {
    try {
        const path = req.query.path;

        if (!path.startsWith('/') || path.indexOf('..') >= 0) {
            res.sendStatus(500);
            return;
        }

        var fullPath = joinPath(lndpRoot, path);
        res.send(queryInformations([fullPath]));
    } catch(e) {
        res.sendStatus(500);
        console.log(e);
    }
})



/**
 * API: GET /lndp/documentCreate
 *   path: folder (must start with '/' and must not contains '..')
 *   name: new file or directory
 *   isdir: 0 = new file, else new directory
 */
restApp.get('/lndp/documentCreate', checkAuthenticateToken, (req, res) => {
    try {
        const path = req.query.path;
        const name = req.query.name;
        const isdir = parseInt(req.query.isdir);

        if (!path.startsWith('/') || path.indexOf('..') >= 0 || name.indexOf('/') >= 0 || name.indexOf('..') >= 0) {
            res.sendStatus(500);
            return;
        }

        const id = joinPath( path, name );
        const fullPath = joinPath(lndpRoot, id);

        fs.stat(fullPath, (err, stat) => {
            if (!err) {
                if (stat.isDirectory()) {
                    if (isdir) {
                        res.send( {'id': id} );
                    } else {
                        res.sendStatus(500);
                    }
                    return;
                } else if (isdir) {
                    res.sendStatus(500);
                    return;
                }
            }

            if (isdir) {
                fs.mkdir(fullPath, { recursive: true }, (err) => {
                    if (err) {
                        res.sendStatus(500);
                    } else {
                        res.send( {'id': id} );
                    }
                })
            } else {
                fs.open(fullPath, 'w', (err, fd) => {
                    if (err) {
                        res.sendStatus(500);
                    } else {
                        fs.close(fd, () => {});
                        res.send( {'id': id} );
                    }
                })
            }
        })
    } catch(e) {
        res.sendStatus(500);
        console.log(e);
    }
})



/**
 * API: GET /lndp/documentRename
 *   path: must start with '/' and must not contains '..'
 *   newname: new file or directory name
 */
restApp.get('/lndp/documentRename', checkAuthenticateToken, (req, res) => {
    try {
        const path = req.query.path;
        const newName = req.query.newname;

        if (!path.startsWith('/') || path.indexOf('..') >= 0 || newName.indexOf('/') >= 0 || newName.indexOf('..') >= 0) {
            res.sendStatus(500);
            return;
        }

        const fullPath = joinPath(lndpRoot, path);
        fs.stat(fullPath, (err, stat) => {
            if (err) {
                res.sendStatus(500);
                return;
            }

            const dirname = fsPath.dirname(path);
            const newPath = joinPath(dirname, newName);
            const fullNewPath = joinPath(lndpRoot, newPath);

            if (fullPath === fullNewPath) {
                res.send({'id': path});
            } else {
                fs.rename(fullPath, fullNewPath, (err) => {
                    if (err) {
                        res.sendStatus(500);
                    } else {
                        res.send({'id': newPath});
                    }
                })
            }
        })
    } catch(e) {
        res.sendStatus(500);
        console.log(e);
    }
})



/**
 * API: GET /lndp/documentRead
 *   path: must start with '/' and must not contains '..'
 *   offset: optional (>= 0)
 *   size: maximum read block size
 */
restApp.get('/lndp/documentRead', checkAuthenticateToken, (req, res) => {
    try {
        const path = req.query.path;
        const offset = parseInt(req.query.offset || '0');
        const size = parseInt(req.query.size);

        if (!path.startsWith('/') || path.indexOf('..') >= 0 || offset < 0 || size <= 0) {
            res.sendStatus(500);
            return
        }

        const fullPath = joinPath(lndpRoot, path);

        fs.stat( fullPath, (err, stat) => {
            if (err || !stat.isFile()) {
                res.sendStatus(204);
            } else {
                fs.open(fullPath, 'r', (err, fd) => {
                    if (err) {
                        res.sendStatus(204);
                    } else {
                        var buffer = new Buffer(size);

                        fs.read( fd, buffer, 0, size, offset, (err, readSize) => {
                            fs.close(fd, () => {});
                            if (readSize >= 0) {
                                res.setHeader('Content-type', 'application/octet-stream');
                                res.send(buffer.slice(0, readSize));
                            }
                        })
                    }
                })
            }
        })
    } catch(e) {
        res.sendStatus(500);
        console.log(e);
    }
})



/**
 * API: POST /lndp/documentAppend
 *   path: must start with '/' and must not contains '..'
 *   block: file data block
 */
restApp.post('/lndp/documentAppend', checkAuthenticateToken, upload.single('block'), (req, res) => {
    try {
        const path = decodeURIComponent(req.body.path);
        const block = req.file;

        if (!path.startsWith('/') || path.indexOf('..') >= 0) {
            res.sendStatus(500);
            return;
        }

        const fullPath = joinPath(lndpRoot, path);

        fs.stat(fullPath, (err, stat) => {
            if (err || stat.isDirectory()) {
                res.sendStatus(500);
                return;
            }

            fs.open(fullPath, "a", (err, fd) => {
                if (err) {
                    res.sendStatus(500);
                    return;
                }

                fs.write( fd, block.buffer, (err) => {
                    fs.close(fd, () => {});
                    if (err) {
                        res.sendStatus(500);
                    } else {
                        res.send('');
                    }
                })
            })
        })
    } catch(e) {
        res.sendStatus(500);
        console.log(e);
    }
})



/**
 * API: GET /lndp/documentReadThumb
 *   path: must start with '/' and must not contains '..'
 */
restApp.get('/lndp/documentReadThumb', checkAuthenticateToken, (req, res) => {
    try {
        const path = req.query.path;

        if (!path.startsWith('/') || path.indexOf('..') >= 0) {
            res.sendStatus(500);
            return;
        }

        const fullPath = joinPath(lndpRoot, path)

        fs.stat(fullPath, (err, stat) => {
            if (err || stat.isDirectory()) {
                res.sendStatus(500);
                return;
            }

            sharp(fullPath)
                .resize(config.thumb.size)
                .rotate()
                .jpeg({ quality: config.thumb.quality })
                .toBuffer()
                .then( buffer => {
                    res.setHeader('Content-type', 'image/jpeg');
                    res.send(buffer);
                })
                .catch( err => {
                    res.sendStatus(500);
                })
        })
    } catch(e) {
        res.sendStatus(500);
        console.log(e);
    }
})



const config = require(process.argv[2] || "./config.json");
const lndpRoot = config.lndp.root.replace("~", os.homedir);
const backupRoot = config.backup.root.replace("~", os.homedir);

config.serviceTypes.forEach((serviceType) => {
    console.log("Start publishing:", serviceType);
    ciao.createService({
        name: os.hostname() + "_" + serviceType,
        type: serviceType,
        port: config.servicePort
    }).advertise();
});

process.on('SIGINT', function() {
    console.log("Caught interrupt signal");
    ciao.destroy();
    process.exit();
});

backup.init();

console.log("Port:", config.servicePort);

restApp.listen(config.servicePort);
// https.createServer( {
//     key: fs.readFileSync(config.ssl.keyFile),
//     cert: fs.readFileSync(config.ssl.certFile),
//     passphrase: config.ssl.passphrase
// }, restApp ).listen(config.servicePort)
