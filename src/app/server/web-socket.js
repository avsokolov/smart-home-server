const url = require('url');
const {Server: WebSocketServer} = require('ws');
const { config } = require('../../shared/service-config');
const { checkRequest } = require('../controllers/auth');

const instances = {
    wsServer: null,
    wssServer: null,
};

function handleConnection(client, req) {
    //check auth
    req.query = url.parse(req.url, true).query;
    if (!checkRequest(req)) {
        client.close(1000, JSON.stringify({ reason: 'auth' }));
        return;
    }

    client.on('message', message => {
        console.log('received: %s', message);
    });

    client.send(JSON.stringify({ action: 'handshake'}));
}

function reloadWebSocketServer(serverInstance, wsType) {
    if (instances[wsType] && !(serverInstance && config.ws.allow)) {
        instances[wsType].clients.forEach(client =>
            client.close(1012, JSON.stringify({ reason: 'reload' }))
        );
        instances[wsType].close();
        instances[wsType] = null;
    }

    if (!instances[wsType] && serverInstance && config.ws.allow) {
        instances[wsType] = new WebSocketServer({
            server: serverInstance,
            path: '/api/ws',
            maxPayload: config.ws.maxPayload,
        });

        instances[wsType].on('connection', handleConnection);
    }
}

function reloadWS(server) {
    reloadWebSocketServer(server.httpServer, 'wsServer');
    reloadWebSocketServer(server.secureServer, 'wssServer');
}

/**
 * @param {WebSocketServer|null} ws
 * @param {string} message
 */
function broadcast(ws, message) {
    if (!ws) return;

    ws.clients.forEach(client => {
       client.send(message);
    });
}

function notify(data) {
    const msg = JSON.stringify(data);

    broadcast(instances.wsServer, msg);
    broadcast(instances.wssServer, msg);
}

module.exports = { reloadWS, notify };
