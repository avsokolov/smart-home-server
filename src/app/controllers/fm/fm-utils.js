const fs = require('fs');
const path = require('path');

export function ls(pathName) {
    return new Promise((ok, fail) => {
        fs.stat(pathName, (err, st) => {
            if (err || st.isFile()) {
                fail(err || 'No access');
                return;
            }

            fs.readdir(pathName, (err, files) => {
                if (err) {
                    fail(err);
                    return;
                }

                let result = [],
                    cnt = files.length;

                let checkFinished = () => {
                    if (!cnt) {
                        ok(result);
                        return true;
                    }
                };

                if (!checkFinished()) {
                    files.forEach((file) => {
                        fs.stat(path.join(pathName, file), (err, stats) => {
                            cnt--;
                            if (!err) {
                                result.push({
                                    name: file,
                                    isDir: stats.isDirectory(),
                                    size: stats.size,
                                    lastModified: stats.mtime.getTime(),
                                    created: stats.ctime.getTime()
                                });
                            }

                            checkFinished();
                        });
                    });
                }
            });
        });
    });
}

export function md(pathName) {
    return new Promise((ok, fail) => {
        fs.stat(pathName, (err) => {
            if (!err) {
                fail('Already exists');
                return;
            }

            fs.mkdir(pathName, (err) => {
                if (err) {
                    fail(err);
                }

                ok();
            });
        });
    });
}

export function rm(fn) {
    return new Promise((ok, fail) => {
        fs.stat(fn, (err, stats) => {
            if (err) {
                fail('Not found');
                return;
            }

            if (stats.isFile()) {
                fs.unlink(fn, (err)=> {
                    if (err) {
                        fail(err);
                    }

                    ok();
                });
            } else {
                fs.rmdir(fn, (err)=> {
                    if (err) {
                        fail(err);
                    }

                    ok();
                });
            }
        });
    });
}
