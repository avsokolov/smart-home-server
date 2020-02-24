const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const url = require('url');
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

const { config } = require('../../shared/service-config');
const logger = require('../../shared/utils/logger').LoggerService.getLogger('server');
const { driverManager } = require('../driver-manager');

const { router: fm } = require('../controllers/fm');
const state = require('../controllers/state');
const auth = require('../controllers/auth');
const { router: deviceRouter } = require('../controllers/device-router');

const { reloadWS } = require('./web-socket');
const { reqId } = require('./middleware/req-id');

const app = express().disable('x-powered-by');

app.use(cors());
app.use(bodyParser.json());       // to support JSON-encoded bodies
app.use(bodyParser.urlencoded({     // to support URL-encoded bodies
    extended: true
}));

app.all('/api/*', reqId);
app.use('/api/auth', auth.router);
app.use('/api/iot', deviceRouter);
app.all('/api/*', auth.checkAuth);
app.get('/api/state', state.get);
app.use('api/fm', fm);

//TODO move to a router
app.get('/api/drivers/list', (req, res) => {
    res.json(driverManager.getModelProcesses());
});
app.all('/api/drivers/request', async (req, res) => {
    logger.debug('New driver request. Query params: \n %s\nBody params:\n%s', JSON.stringify(req.query), JSON.stringify(req.body));
    let driverName = req.query.name || req.body.name;
    let method = req.query.method || req.body.method;
    let args = req.body.hasOwnProperty('args') ? req.body.args : req.query.args;
    let result = await driverManager.request(driverName, method, args);
    res.json(result);
});

app.all('/api/*', (req, res) => {
    res.status(404).json({ message: '404 - server API method not found' });
});


//default handler (for client-side routeing)
app.get('/favicon.ico', (req, res) => {
    res.sendFile(path.join(process.cwd(), '/app/images/icon.png'));
});

app.use(express.static(path.join(process.cwd(), '/public')));
app.use('/*', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'public', 'index.html'), {
        lastModified: false
    });
});

function redirectHandler(req, res) {
    if (req.headers.host === 'alexsk.su') {
        res.writeHead(301, {'Location': 'https://www.alexsk.su' + req.url});
        res.end();
        return;
    }

    app(req, res);
}

export class Server {
    constructor() {
        this.secureServer = null;
        this.httpServer = null;

        this.reload();
    }

    reload() {
        this._loadHttpServer();
        this._loadSecureServer();
        reloadWS(this);
    }

    _loadHttpServer() {
        if (this.httpServer && !config.server.allow) {
            this.httpServer.close();
            this.httpServer = null;
        }

        if (!this.httpServer && config.server.allow) {
            this.httpServer = http.createServer((req, res) => {
                if (req.headers.host !== 'alexsk.su' && req.socket.remoteAddress.startsWith('::ffff:192.168.')) {
                    const data = url.parse(req.url, true);
                    hw.newDataFromRemoteDev(data);
                    driverManager.request('esp', 'setEspData', data.query);
                    res.writeHead(200, {'content-type': 'application/json; charset=utf-8'});
                    res.write('{"result":0}');
                    res.end();
                } else if (config.server.internalOnly) {
                    const data = url.parse(req.url, true);
                    logger.warn(`unknown request frm ${req.socket.remoteAddress}: `, JSON.stringify(data));
                    res.writeHead(301, {'Location': 'https://www.alexsk.su' + req.url});
                    res.end();
                } else {
                    app(req, res);
                }
            }).listen(config.server.port);

            logger.info(`listening http server on port ${config.server.port}`);
        }
    }

    _loadSecureServer() {
        if (this.secureServer && !config.server.secure.allow) {
            this.httpServer.close();
            this.httpServer = null;
        }

        if (!this.secureServer && config.server.secure.allow) {
            const options = {
                cert: fs.readFileSync(config.server.secure.ssl.fullchain),
                key: fs.readFileSync(config.server.secure.ssl.privkey),
            };

            this.secureServer = https.createServer(options, redirectHandler).listen(config.server.secure.port);

            logger.info(`listening https server on port ${config.server.secure.port}`);
        }
    }
}
