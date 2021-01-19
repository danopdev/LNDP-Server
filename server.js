const https = require('https')
const express = require('express')
var multer  = require('multer')
const fs = require('fs')
const os = require('os')
const fsPath = require('path')
const sharp = require('sharp')
const md5lib = require('md5')
const mimeTypes = require('mime-types')

const config = require("./config.json")
const lndpRoot = config.lndp.root.replace("~", os.homedir)
const backupRoot = config.backup.root.replace("~", os.homedir)

const upload = multer({ storage: multer.memoryStorage() })
const restApp = express()



var backup = {
    items: [],

    init: function() {
        setInterval(cleanUP, config.backup.checkDeadUploadPeriod * 1000);
    },

    cleanUp: function() {
        const now = Math.floor(Date.now() / 1000)

        Object.keys(items).forEach(key => {
            const item = items[key]
            if ((now - item.lastModificationTime) > config.backup.maxUploadTime) {
                console.log("[backupCleanUp] Delete id:", key)
                remove(key)
            }
        });

        items = keepItems
    },

    remove: function(key) {
        if (hasKey(key)) {
            delete items[key]
        }
    },

    hasKey: function(key) {
        return key in items
    },

    add: function( path, size, md5, buffer ) {
        var uploadInfo = {
            path,
            size,
            md5,
            data: buffer,
            lastModificationTime: Math.floor(Date.now() / 1000),

            update: function( buffer ) {
                data = Buffer.concat( [ data, buffer ] )
                lastModificationTime = Math.floor(Date.now() / 1000)
            }
        }

        items[path] = uploadInfo
        return uploadInfo
    },

    upload: function( res, path, size, offset, md5 ) {
        if (size < 0 || offset < 0 || path.startsWith('/') || path.indexOf('..') >= 0) {
            res.sendStatus(500)
            return
        }

        const fullpath = os.path.join(backupRoot, path)

        fs.lstat(localpath, (err, stat) => {
            if (!err) {
                remove(path)
                res.sendStatus(409)
                return
            }

            var uploadInfo

            if (offset > 0) {
                uploadInfo = backup.items[path]
                if (uploadInfo || uploadInfo.size != size || uploadInfo.md5 != md5 || uploadInfo.data.length != offset) {
                    res.sendStatus(500)
                    return
                }

                uploadInfo.update(block.buffer)
            } else {
                uploadInfo = backup.add( path, size, md5, block.buffer )
            }

            if (uploadInfo.data.length > size) {
                remove(path)
                res.sendStatus(500)
                return
            }

            if (uploadFile.data.length < size) {
                res.sendStatus(200)
                return
            }

            remove(path)

            const md5Buffer = md5lib(uploadFile.buffer)
            if (md5 != md5Buffer) {
                res.sendStatus(200)
                return
            }

            fs.mkdir(fsPath.dirname(fullpath), { recursive: true }, (err) => {
                if (err) {
                    res.sendStatus(500)
                    return
                }

                fs.writeFile(fullPath, uploadFile.data, "binary", (err) => {
                    if (err) {
                        res.send(500)
                    } else {
                        res.send(200)
                    }
                })
            })
        })
    }
}



function joinPath( left, right ) {
    if ( left.endsWith('/') && right.startsWith('/') ) {
        return left + right.substring(1)
    }

    if ( left.endsWith('/') || right.startsWith('/') ) {
        return left + right
    }

    return left + '/' + right
}



function checkAuthenticateToken(req, res, next) {
    if (config.authTokens) {
        const authHeader = req.headers['authorization']
        const token = authHeader && authHeader.split(' ')[1]
        if (token == null) {
            res.sendStatus(204)
            return
        }

        console.log("Token:", token)
        if (!config.authTokens.includes(token)) {
            res.sendStatus(403)
            return
        }
    }

    next()
}



restApp.post('/backup', checkAuthenticateToken, upload.single('block'), (req, res) => {
    backup.upload( res, decodeURI(req.body.path), parseInt(req.body.size), parseInt(req.body.offset), req.body.md5, req.file.buffer )
})



function queryInformations( fullPaths ) {
    const lenRoot = lndpRoot.length
    var output = []

    fullPaths.forEach((fullPath, i) => {
        const stat = fs.lstatSync(fullPath)
        var mimeType = 'application/octet-stream'

        if (stat.isDirectory()) {
            mimeType = 'application/x-directory'
        } else {
            try {
                mimeType = mimeTypes.lookup(fullPath)
            } catch(e) {

            }
        }

        const id = fullPath.substring(lenRoot)
        if ('/' == id) {
            name = id
        } else {
            name = id.split('/').pop()
        }

        output.push( {
            'id' : id,
            'name' : name,
            'isdir' : stat.isDirectory(),
            'size' : stat.size,
            'date' : Math.floor(stat.mtimeMs * 1000),
            'type' : mimeType,
            'thumb' : mimeType == 'image/jpeg'
        } )
    })

    return output
}



restApp.get('/lndp/queryChildDocuments', checkAuthenticateToken, (req, res) => {
    const path = req.query.path

    if (!path.startsWith('/') || path.indexOf('..') >= 0) {
        res.sendStatus(500)
        return
    }

    const fullPath = joinPath(lndpRoot, path)
    const stat = fs.lstatSync(fullPath)

    if (!stat.isDirectory()) {
        res.sendStatus(204)
        return
    }

    fs.readdir(fullPath, (err, files) => {
        var items = []
        files.forEach(file => {
            items.push( joinPath(fullPath, file) )
        })
        res.send(queryInformations(items))
    })
})



restApp.get('/lndp/queryDocument', checkAuthenticateToken, (req, res) => {
    const path = req.query.path

    if (!path.startsWith('/') || path.indexOf('..') >= 0) {
        res.sendStatus(500)
        return
    }

    var fullPath = joinPath(lndpRoot, path)
    res.send(queryInformations([fullPath]))
})



restApp.get('/lndp/documentCreate', checkAuthenticateToken, (req, res) => {
    const path = req.query.path
    const name = req.query.name
    const isdir = parseInt(req.query.isdir)

    if (!path.startsWith('/') || path.indexOf('..') >= 0 || name.indexOf('/') >= 0 || name.indexOf('..') >= 0) {
        res.sendStatus(500)
        return
    }

    const id = joinPath( path, name )
    const fullPath = joinPath(lndpRoot, id)

    fs.lstat(fullPath, (err, stat) => {
        if (!err) {
            if (stat.isDirectory() && !isdir) {
                res.sendStatus(500)
            } else {
                res.send( {'id': id} )
            }
        } else {
            if (isdir) {
                fs.mkdir(fullPath, { recursive: true }, (err) => {
                    if (err) {
                        res.sendStatus(500)
                    } else {
                        res.send( {'id': id} )
                    }
                })
            } else {
                fs.open(fullPath, 'w', (err, fd) => {
                    if (err) {
                        res.sendStatus(500)
                    } else {
                        fs.close(fd, () => {})
                        res.send( {'id': id} )
                    }
                })
            }
        }
    })
})



restApp.get('/lndp/documentRename', checkAuthenticateToken, (req, res) => {
    const path = req.query.path
    const newName = req.query.newname

    if (!path.startsWith('/') || path.indexOf('..') >= 0 || newName.indexOf('/') >= 0 || newName.indexOf('..') >= 0) {
        res.sendStatus(500)
        return
    }

    const fullPath = joinPath(lndpRoot, path)
    fs.lstat(fullPath, (err, stat) => {
        if (!err) {
            res.sendStatus(500)
            return
        }

        const dirname = fsPath.dirname(path)
        const newPath = joinPath(dirname, newName)
        const fullNewPath = joinPath(lndpRoot, newPath)

        if (fullPath === fullNewPath) {
            res.send({'id': path})
        } else {
            try {
                fs.rename(fullPath, fullNewPath)
                res.send({'id': newPath})
            } catch(e) {
                res.sendStatus(500)
            }
        }
    })
})



restApp.get('/lndp/documentRead', checkAuthenticateToken, (req, res) => {
    const path = req.query.path
    const offset = parseInt(req.query.offset || '0')
    const size = parseInt(req.query.size)

    if (!path.startsWith('/') || path.indexOf('..') >= 0 || offset < 0 || size <= 0) {
        res.sendStatus(500)
        return
    }

    const fullPath = joinPath(lndpRoot, path)

    fs.lstat( fullPath, (err, stat) => {
        if (err || !stat.isFile()) {
            res.sendStatus(204)
        } else {
            fs.open(fullPath, 'r', (err, fd) => {
                if (err) {
                    res.sendStatus(204)
                } else {
                    var buffer = new Buffer(size)

                    fs.read( fd, buffer, 0, size, offset, (err, readSize) => {
                        fs.close(fd, () => {})
                        if (readSize >= 0) {
                            res.setHeader('Content-type', 'application/octet-stream')
                            res.send(Buffer.from(buffer, 0, readSize))
                        }
                    })
                }
            })
        }
    })
})



restApp.post('/lndp/documentAppend', checkAuthenticateToken, upload.single('block'), (req, res) => {
    const path = decodeURI(req.body.path)
    const block = req.file

    if (!path.startsWith('/') || path.indexOf('..') >= 0) {
        res.sendStatus(500)
        return
    }

    const fullPath = joinPath(lndpRoot, path)

    fs.lstat(fullPath, (err, stat) => {
        if (err || stat.isDirectory()) {
            res.sendStatus(500)
            return
        }

        fs.open(fullPath, "a", (err, fd) => {
            if (err) {
                res.sendStatus(500)
                return
            }

            fs.write( fd, block.buffer, (err) => {
                fs.close(fd, () => {})
                if (err) {
                    res.sendStatus(500)
                } else {
                    res.send('')
                }
            })
        })
    })
})



restApp.get('/lndp/documentReadThumb', checkAuthenticateToken, (req, res) => {
    const path = req.query.path

    if (!path.startsWith('/') || path.indexOf('..') >= 0) {
        res.sendStatus(500)
        return
    }

    const fullPath = joinPath(lndpRoot, path)

    fs.lstat(fullPath, (err, stat) => {
        if (err || stat.isDirectory()) {
            res.sendStatus(500)
            return
        }

        sharp(fullPath)
            .resize(config.thumb.size)
            .rotate()
            .jpeg({ quality: config.thumb.quality })
            .toBuffer()
            .then( buffer => {
                res.setHeader('Content-type', 'image/jpeg')
                res.send(buffer)
            })
            .catch( err => {
                res.sendStatus(500)
            })
    })
})



console.log("Port:", config.servicePort)
//restApp.listen(config.servicePort)
https.createServer( {
    key: fs.readFileSync(config.ssl.keyFile),
    cert: fs.readFileSync(config.ssl.certFile),
    passphrase: config.ssl.passphrase
}, restApp ).listen(config.servicePort)
