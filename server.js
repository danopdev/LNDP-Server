const express = require('express')
const multer  = require('multer')
const { promises: fs } = require("fs")
const os = require('os')
const fsPath = require('path')
const sharp = require('sharp')
const md5lib = require('md5')
const mimeTypes = require('mime-types')
const ciao = require("@homebridge/ciao").getResponder()
const debug = require('debug')('lndp')


const upload = multer({ storage: multer.memoryStorage() })
const app = express()


function isValidFileName(name) {
    return name !== '' && name !== '.' && name !== '..' && name !== '~' && name.indexOf('/') < 0
}


function isValidPath(path) {
    return path.startsWith('/')
        && !path.endsWith('/.') && !path.endsWith('/..')  && !path.endsWith('~') 
        && path.indexOf('/./') < 0 && path.indexOf('/../') < 0 && path.indexOf('/~/') < 0
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


async function fileExists(fullPath) {
    try {
        await fs.stat(fullPath)
        return true
    } catch(e) {
        return false
    }
}


function checkAuthenticateToken(req, res, next) {
    try {
        if (config.authTokens) {
            const authHeader = req.headers['authorization']
            const token = authHeader && authHeader.split(' ')[1]
            if (token == null) {
                debug('Auth: KO (403)')
                return res.sendStatus(403)
            }

            if (!config.authTokens.includes(token)) {
                debug("Invalid token:", token)
                return res.sendStatus(403)
            }
        }

        next()
    } catch(e) {
        debug('Auth: KO (500)')
        res.sendStatus(500)
    }
}


function parsePathParam(req, res, next) {
    try {
        const path = req.query.path

        if (!isValidPath(path)) {
            debug('[checkPathParam]', 'Invalid path:', path)
            return res.sendStatus(500)
        }

        req.params.path = path
        req.params.fullPath = joinPath(lndpRoot, path)
        debug('[checkPathParam]', 'path:', path)

        next()
    } catch(e) {
        res.sendStatus(500)
        debug('[checkPathParam]', 'Unknown error path:', path)
    }
}


async function getThumbPath( fullPath ) {
    const uriFullPath = "file://" + fullPath
    const md5 = md5lib(uriFullPath)
    const basePath = process.env.HOME + '/.cache/thumbnails/'

    for (const folder of [ 'large', 'normal' ]) {
        const thumbPath = basePath + folder + '/' + md5 + '.png'
        if (await fileExists(thumbPath)) return thumbPath
    }

    return null
}


async function hasThumb( fullPath, mimeType ) {
    return mimeType.startsWith('image/') || null !== await getThumbPath(fullPath)
}


async function queryInformations( fullPaths, addMd5 ) {
    const lenRoot = lndpRoot.length
    var output = []

    for(const fullPath of fullPaths) {
        const stat = await fs.stat(fullPath)
        var mimeType = 'application/octet-stream'

        if (stat.isDirectory()) {
            mimeType = 'application/x-directory'
        } else {
            try {
                var mimeType_ = mimeTypes.lookup(fullPath)
                if (mimeType_ !== false) mimeType = mimeType_
            } catch(e) {
            }
        }

        const id = fullPath.substring(lenRoot)
        let name = ''
        if ('/' == id) {
            name = id
        } else {
            name = id.split('/').pop()
        }

        var isReadOnly = true
        if (!config.readOnly) {
            try {
                await fs.access(fullPath, fs.W_OK)
                isReadOnly = false
            } catch(e) {
                debug(e)
            }
        }

        const thumb = stat.isDirectory() ? false : await hasThumb(fullPath, mimeType)

        const entry = {
            'id': id,
            'name': name,
            'isdir' : stat.isDirectory(),
            'isreadonly': isReadOnly,
            'size': stat.size,
            'date': stat.mtimeMs,
            'type': mimeType,
            'thumb': thumb
        }

        if (addMd5) {
            let md5 = 0

            if (!stat.isDirectory()) {
                try {
                    const fileData = await fs.readFile(fullPath)
                    md5 = md5lib( fileData )
                } catch (e) {
                }
            }

            entry['md5'] = md5
        }

        output.push( entry )
    }

    return output
}



/**
 * API: GET /queryChildDocuments
 * @param path
 */
app.get('/queryChildDocuments', checkAuthenticateToken, parsePathParam, async (req, res) => {
    try {
        debug('[queryChildDocuments]')

        const fullPath = req.params.fullPath
        const stat = await fs.stat(fullPath)

        if (!stat.isDirectory()) {
            return res.sendStatus(204)
        }

        const content = await fs.readdir(fullPath)
        const items = content.map(item => joinPath(fullPath, item))
        res.send(await queryInformations(items))
    } catch(e) {
        res.sendStatus(500)
        debug(e)
    }
})



/**
 * API: GET /queryDocument
 * @param path
 */
app.get('/queryDocument', checkAuthenticateToken, parsePathParam, async (req, res) => {
    try {
        debug('[queryDocument]')
        res.send(await queryInformations([req.params.fullPath], req.query.md5))
    } catch(e) {
        debug(e)
        res.sendStatus(500)
    }
})



/**
 * API: GET /documentCreate
 * @param path
 * @param name: new file or directory. If ommited or empty it means is already part of the path
 * @param isdir: 1 = new directory, else (or omitted) new file
 */
app.get('/documentCreate', checkAuthenticateToken, parsePathParam, async (req, res) => {
    if (config.readOnly) {
        return res.sendStatus(500)
    }

    try {
        const name = req.query.name
        const isdir = 1 === parseInt(req.query.isdir)
        debug('[documentCreate]', 'name:', name, 'isdir:', isdir)

        if (name && !isValidFileName(name)) {
            return res.sendStatus(500)
        }

        const id = name ? joinPath( req.params.path, name ) : req.params.path
        const fullPath = joinPath(lndpRoot, id)

        try {
            const stat = await fs.stat(fullPath)
            debug('[documentCreate]', 'Already exists - directory', stat.isDirectory())
            if (stat.isDirectory() && isdir) {
                return res.send( {'id': id} )
            } else if (isdir || stat.isDirectory()) {
                return res.sendStatus(500)
            }
        } catch(e) {
        }

        if (isdir) {
            await fs.mkdir(fullPath, { recursive: true })
            res.send( {'id': id} )
        } else {
            const dirPath = fsPath.dirname(fullPath)
            await fs.mkdir(dirPath, { recursive: true })
            const fd = await fs.open(fullPath, 'w')
            await fd.close()
            res.send( {'id': id} )
        }
    } catch(e) {
        res.sendStatus(500)
        debug(e)
    }
})



/**
 * API: GET /documentRename
 * @param path
 * @param newname: new file or directory name (or full path to move it into another folder)
 */
app.get('/documentRename', checkAuthenticateToken, parsePathParam, async (req, res) => {
    if (config.readOnly) {
        return res.sendStatus(500)
    }

    try {
        const newName = req.query.newname
        debug('[documentRename]', 'newName:', newName)

        const newNameIsValidFileName = isValidFileName(newName)
        const newNameIsValidPath = isValidPath(newName)

        if (!newNameIsValidFileName && !newNameIsValidPath) {
            return res.sendStatus(500)
        }

        const path = req.params.path
        const fullPath = req.params.fullPath

        const exists = await fileExists(fullPath)

        if (exists) {
            const newPath = newNameIsValidPath ? newName : joinPath(fsPath.dirname(path), newName)
            const fullNewPath = joinPath(lndpRoot, newPath)

            if (fullPath !== fullNewPath) {
                await fs.rename(fullPath, fullNewPath)
            }

            res.send({'id': newPath})
        } else {
            res.sendStatus(500)
        }
    } catch(e) {
        res.sendStatus(500)
        debug(e)
    }
})



/**
 * API: GET /documentRead
 * @param path
 * @param offset: optional (default 0, must be >= 0)
 * @param size: maximum read block size (must be > 0)
 */
app.get('/documentRead', checkAuthenticateToken, parsePathParam, async (req, res) => {
    try {
        const offset = parseInt(req.query.offset || '0')
        const size = parseInt(req.query.size)
        debug('[documentRead]', offset, 'size:', size)

        if (offset < 0 || size <= 0) {
            return res.sendStatus(500)
        }

        const fullPath = req.params.fullPath
        const stat = await fs.stat(fullPath)

        if (!stat.isFile()) {
            return res.sendStatus(204)
        }

        const buffer = Buffer.alloc(size)
        const fd = await fs.open(fullPath, 'r')
        const readData = await fd.read( buffer, 0, size, offset)
        await fd.close()

        if (readData.bytesRead >= 0) {
            res.setHeader('Content-type', 'application/octet-stream')
            return res.send(buffer.slice(0, readData.bytesRead))
        }

        res.sendStatus(500)
    } catch(e) {
        debug(e)
        res.sendStatus(500)
    }
})



/**
 * API: POST /documentAppend
 * @param path
 * @param block: file data block
 */
app.post('/documentAppend', checkAuthenticateToken, parsePathParam, upload.single('block'), async (req, res) => {
    if (config.readOnly) {
        return res.sendStatus(500)
    }

    try {
        const block = req.file
        debug('[documentAppend]', 'blockSize:', block.buffer.length)

        const fullPath = req.params.fullPath
        const fd = await fs.open(fullPath, "a")
        await fd.write( block.buffer)
        await fd.close()
        res.send('')
    } catch(e) {
        res.sendStatus(500)
        debug(e)
    }
})



/**
 * API: GET /documentReadThumb
 * @param path
 */
app.get('/documentReadThumb', checkAuthenticateToken, parsePathParam, async (req, res) => {
    try {
        debug('[documentReadThumb]')

        const fullPath = req.params.fullPath
        const stat = await fs.stat(fullPath)

        if (stat.isDirectory()) {
            return res.sendStatus(500)
        }

        const thumbPath = await getThumbPath(fullPath)
        const readThumbPath = (null != thumbPath) ? thumbPath : fullPath

        const thumbData = await sharp(readThumbPath)
            .resize(config.thumb.size)
            .rotate()
            .jpeg({ quality: config.thumb.quality })
            .toBuffer()

        res.setHeader('Content-type', 'image/jpeg')
        res.send(thumbData)
} catch(e) {
        res.sendStatus(500)
        debug(e)
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



const config = require(process.argv[2] || "./config.json")
const lndpRoot = toAbsPath(config.root)
const serverName = os.hostname() + '-' + os.type()

console.log("Name:", serverName)
console.log("Port:", config.servicePort)
console.log("Path:", lndpRoot)

ciao.createService({
    name: serverName,
    type: "lndp",
    port: config.servicePort
}).advertise()

process.on('SIGINT', function() {
    console.log("Caught interrupt signal")
    ciao.destroy()
    process.exit()
})

app.listen(config.servicePort)
