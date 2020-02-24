const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { Router } = require('express');

const { isAdmin } = require('../auth');
const fm = require('./fm-utils');

const MAX_FILE_SIZE = 1024 * 1024 * 10;
const MAX_FILES = 10;
const PUBLIC_ROOT_PATH = 'drivers';

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        let pathName = (req.query.path || '/').toString();

        if (pathName && pathName.length && pathName[0] !== '/') {
            pathName = '/' + pathName;
        }

        if (
            pathName.indexOf('./') !== -1 ||
            pathName.indexOf('/.') !== -1
        ) {
            pathName = '/';
        }

        pathName = path.join(process.cwd(), '/app' + pathName);
        const fileName = path.join(pathName, file.filename);
        fs.stat(fileName, (err) => {
            if (!err) {
                fs.unlink(fileName, () => {
                    cb(null, pathName);
                });
            } else {
                cb(null, pathName);
            }
        });
    },
    filename: function (req, file, cb) {
        cb(null, file.filename);
    }
});

const uploader = multer({
    storage: storage,
    limits: {fileSize: MAX_FILE_SIZE, files: MAX_FILES}
});

function ls(req, res) {
    let pathName = (req.query.path || '/').toString();
    if (pathName && pathName.length && pathName[0] !== '/') {
        pathName = '/' + pathName;
    }

    if (pathName.indexOf('./') !== -1 || pathName.indexOf('/.') !== -1) {
        res.status(400).json({result: 'wrong path'});
        return;
    }

    pathName = path.join(process.cwd(), PUBLIC_ROOT_PATH, pathName);
    fm.ls(pathName)
        .then(list => {
            res.json({
                result: 'ok',
                files: list
            });
        })
        .catch(ex=> {
            const err = ex.message || ex || 'internal error';
            res.status(400).json({result: err});
        });
}

function md(req, res) {
    let pathName = (req.query.path || '/').toString(),
        name = (req.body.name || name).toString();
    if (pathName && pathName.length && pathName[0] !== '/') {
        pathName = '/' + pathName;
    }

    if (
        pathName.indexOf('./') !== -1 || pathName.indexOf('/.') !== -1 || !name || !/^\w+$/.test(name)
    ) {
        res.status(400).json({result: 'wrong path or file name'});
        return;
    }

    pathName = path.join(process.cwd(), PUBLIC_ROOT_PATH, pathName, name);

    fm.md(pathName)
        .then(() => res.json({result: 'ok'}))
        .catch(err => res.status(400).json({result: err}));
}

function rm(req, res) {
    let fn = (req.query.path || '').toString();
    if (fn && fn.length && fn[0] !== '/') {
        fn = '/' + fn;
    }

    if (!fn || fn.indexOf('./') !== -1 || fn === '/' || fn.indexOf('/.') !== -1) {
        res.status(400).json({result: 'wrong file name'});
        return;
    }

    fn = path.join(process.cwd(), PUBLIC_ROOT_PATH, fn);
    fm.rm(fn)
        .then(() => res.json({result: 'ok'}))
        .catch(err => res.status(400).json({result: err}));
}

function download(req, res, next) {
    let fn = (req.query.file || '').toString();
    if (!fn || fn[0] === '.' || fn.indexOf('../') !== -1 || fn.indexOf('/..') !== -1) {
        next();
        return;
    }

    fn = path.join(process.cwd(), '/app' + fn);
    fs.stat(fn, (err, stats) => {
        if (err || !stats.isFile()) {
            next();
            return;
        }

        res.download(fn);
    });
}

function uploadComplete(req, res) {
    const result = [];
    if (req.files) {
        for (const file in req.files) {
            if (req.files.hasOwnProperty(file)) {
                result.push({
                    fn: req.files[file].filename,
                    size: req.files[file].size
                });
            }
        }
    }

    if (result.length) {
        res.json(result);
    } else {
        res.status(400).json({result: 'no files'});
    }
}

export const router = new Router();
router.all('/*', isAdmin);
router.get('/list', ls);
router.get('/download', download);
router.post('/mkdir', md);
router.delete('/remove', rm);
router.put('/upload', uploader.any(), uploadComplete);
