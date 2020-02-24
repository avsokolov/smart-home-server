const { Router } = require('express');
const { driverManager } = require('../driver-manager');
const { checkAuth } = require('./auth');

export const router = new Router();

async function processRequest(driver, path, method, req, res) {
    const { code, body, resultCode } = await driverManager.restRequest(driver, path, method, {
        headers: req.headers,
        query: req.query,
        body: req.body,
        user: req.user,
        externalUser: req.externalUser,
        requestId: req.requestId,
    });

    if (resultCode) {
        return res.status(500).json({ message: 'something went wrong' });
    }

    if (body) {
        res.status(code).json(body);
    } else {
        res.sendStatus(code);
    }
}

function unregisterDevice(name) {
    const ix = router.stack.findIndex(route => route.path && route.path.startsWith(`/${name}`));

    if (ix !== -1) {
        router.stack.splice(ix, 1);
    }
}

const ALLOWED_METHODS = ['GET', 'POST', 'DELETE', 'PUT', 'HEAD'];
function registerDevice(name, restApi) {
    unregisterDevice(name);
    const deviceRouter = new Router();
    router.use(`/${name}`, deviceRouter);

    Object.keys(restApi).forEach(path => {
        const routeInfo = restApi[path];
        routeInfo.methods
            .filter(method => ALLOWED_METHODS.includes(method))
            .map(method => method.toLowerCase())
            .forEach(method => {
                if (routeInfo.allowUnauthorized) {
                    deviceRouter[method](path, processRequest.bind(null, name, path, method));
                } else {
                    deviceRouter[method](path, checkAuth, processRequest.bind(null, name, path, method));
                }
            });
    });
}

driverManager.on(driverManager.Events.driverLoaded, ({info, restApi}) => {
    if (restApi) {
        registerDevice(info.name, restApi);
    }
});

driverManager.on(driverManager.Events.driverUnloaded, name => unregisterDevice(name));
