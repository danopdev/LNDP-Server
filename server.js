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


function isValidFileName(name) {
    return name !== '.' && name !== '..' && name !== '~' && name.indexOf('/') < 0
}


function isValidPath(path) {
    return path.startsWith('/')
        && !path.endsWith('/.') && !path.endsWith('/..')  && !path.endsWith('~') 
        && path.indexOf('/./') < 0 && path.indexOf('/../') < 0 && path.indexOf('/~/') < 0
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

            //console.log("Token:", token)
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


function getThumbPath( fullPath ) {
    const uriFullPath = "file://" + fullPath
    const md5 = md5lib(uriFullPath)
    const basePath = process.env.HOME + '/.cache/thumbnails/'

    for (const folder of [ 'large', 'normal' ]) {
        const thumbPath = basePath + 'large/' + md5 + '.png'
        if (fs.existsSync(thumbPath)) return thumbPath
    }

    return null
}


function hasThumb( fullPath, mimeType ) {
    return mimeType.startsWith('image/') || null !== getThumbPath(fullPath)
}


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
                if (mimeType_ !== false) mimeType = mimeType_;
            } catch(e) {
            }
        }

        const id = fullPath.substring(lenRoot);
        let name = ''
        if ('/' == id) {
            name = id;
        } else {
            name = id.split('/').pop();
        }

        try {
            fs.accessSync(fullPath, fs.constants.R_OK);

            var isReadOnly = true;
            if (!config.readOnly) {
                try {
                    fs.accessSync(fullPath, fs.constants.R_OK);
                    isReadOnly = false;
                } catch(e) {
                }
            }

            const thumb = stat.isDirectory() ? false : hasThumb(fullPath, mimeType)

            output.push( {
                'id': id,
                'name': name,
                'isdir' : stat.isDirectory(),
                'isreadonly': isReadOnly,
                'size': stat.size,
                'date': stat.mtimeMs,
                'type': mimeType,
                'thumb': thumb
            } )
        } catch(e) {
        }
    })

    return output
}



/**
 * API: GET /queryChildDocuments
 *   path: must start with '/' and must not contains '..'
 */
restApp.get('/queryChildDocuments', checkAuthenticateToken, (req, res) => {
    try {
        const path = req.query.path;

        if (!isValidPath(path)) {
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
 * API: GET /queryDocument
 *   path: must start with '/' and must not contains '..'
 */
restApp.get('/queryDocument', checkAuthenticateToken, (req, res) => {
    try {
        const path = req.query.path;

        if (!isValidPath(path)) {
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
 * API: GET /documentCreate
 *   path: folder (must start with '/' and must not contains '..')
 *   name: new file or directory
 *   isdir: 0 = new file, else new directory
 */
restApp.get('/documentCreate', checkAuthenticateToken, (req, res) => {
    if (config.readOnly) {
        res.sendStatus(500);
        return;
    }

    try {
        const path = req.query.path;
        const name = req.query.name;
        const isdir = parseInt(req.query.isdir);

        if (!isValidPath(path) || !isValidFileName(name)) {
            res.sendStatus(500);
            return;
        }

        const id = joinPath( path, name );
        const fullPath = joinPath(lndpRoot, id);

        fs.stat(fullPath, (err, stat) => {
            if (!err) {
                if (stat.isDirectory() === isdir) {
                    res.send( {'id': id} );
                } else {
                    res.sendStatus(500);
                }
                return;
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
                const dirName = fsPath.dirname(fullPath)
                fs.mkdir(dirName, { recursive: true }, (err) => {
                    if (err) {
                        res.sendStatus(500);
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
            }
        })
    } catch(e) {
        res.sendStatus(500);
        console.log(e);
    }
})



/**
 * API: GET /documentRename
 *   path: must start with '/' and must not contains '..'
 *   newname: new file or directory name
 */
restApp.get('/documentRename', checkAuthenticateToken, (req, res) => {
    if (config.readOnly) {
        res.sendStatus(500);
        return;
    }

    try {
        const path = req.query.path;
        const newName = req.query.newname;
        const newNameIsValidFileName = isValidFileName(newName)
        const newNameIsValidPath = isValidPath(newName)

        if (!isValidPath(path) || !(newNameIsValidFileName || newNameIsValidPath)) {
            res.sendStatus(500);
            return;
        }

        const fullPath = joinPath(lndpRoot, path);
        fs.stat(fullPath, (err, stat) => {
            if (err) {
                res.sendStatus(500);
                return;
            }

            const newPath = newNameIsValidPath ? newName : joinPath(fsPath.dirname(path), newName);
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
 * API: GET /documentRead
 *   path: must start with '/' and must not contains '..'
 *   offset: optional (>= 0)
 *   size: maximum read block size
 */
restApp.get('/documentRead', checkAuthenticateToken, (req, res) => {
    try {
        const path = req.query.path;
        const offset = parseInt(req.query.offset || '0');
        const size = parseInt(req.query.size);

        if (!isValidPath(path) || offset < 0 || size <= 0) {
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
                        var buffer = Buffer.alloc(size);

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
 * API: POST /documentAppend
 *   path: must start with '/' and must not contains '..'
 *   block: file data block
 */
restApp.post('/documentAppend', checkAuthenticateToken, upload.single('block'), (req, res) => {
    if (config.readOnly) {
        res.sendStatus(500);
        return;
    }

    try {
        const path = req.query.path;
        const block = req.file;

        if (!isValidPath(path)) {
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
 * API: GET /documentReadThumb
 *   path: must start with '/' and must not contains '..'
 */
restApp.get('/documentReadThumb', checkAuthenticateToken, (req, res) => {
    try {
        const path = req.query.path;

        if (!isValidPath(path)) {
            res.sendStatus(500);
            return;
        }

        const fullPath = joinPath(lndpRoot, path)

        fs.stat(fullPath, (err, stat) => {
            if (err || stat.isDirectory()) {
                res.sendStatus(500);
                return;
            }

            const thumbPath = getThumbPath(fullPath)

            if (null != thumbPath) {
                fs.readFile( thumbPath, null, (err, data) => {
                    if (err) {
                        res.sendStatus(500);
                    } else {
                        res.setHeader('Content-type', 'image/png');
                        res.send(data);
                    }
                })
            } else {
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
            }
        })
    } catch(e) {
        res.sendStatus(500);
        console.log(e);
    }
})



function toAbsPath(path) {
    if (path.startsWith('~')) {
        path = joinPath( os.homedir, path.substring(1) )
    } else if (path.startsWith('.')) {
        path = joinPath( process.cwd(), path )
    }
    return fsPath.normalize(path)
}



const config = require(process.argv[2] || "./config.json");
const lndpRoot = toAbsPath(config.root);
const serverName = os.hostname() + '-' + os.type()

console.log("Name:", serverName);
console.log("Port:", config.servicePort);
console.log("Path:", lndpRoot);

ciao.createService({
    name: serverName,
    type: "lndp",
    port: config.servicePort
}).advertise();

process.on('SIGINT', function() {
    console.log("Caught interrupt signal");
    ciao.destroy();
    process.exit();
});

restApp.listen(config.servicePort);
