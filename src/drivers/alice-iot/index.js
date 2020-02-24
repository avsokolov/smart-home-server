const AbstractDriver = require('../abstract-driver');
const api = require('./yandex-api');

module.exports = class AliceIoT extends AbstractDriver {
    constructor(name) {
        super(
            name,
            'Yandex.Alice smart-home integration driver',
            { methods: [], state: [] }
        );
    }

    get restApi() {
        return {
            [api.ping()]: {
                allowUnauthorized: true,
                methods: ['HEAD'],
            },
            [api.unlinkUser()]: {
                allowUnauthorized: true,
                methods: ['POST'],
            },
            [api.getDevices()]: {
                allowUnauthorized: true,
                methods: ['GET'],
            },
            [api.getDevicesState()]: {
                allowUnauthorized: true,
                methods: ['POST'],
            },
            [api.setDeviceState()]: {
                allowUnauthorized: true,
                methods: ['POST'],
            },
        };
    }

    async restRequest(method, path, request) {
        let message;

        try {
            switch (path) {
                case api.ping():
                    return this.ping(request);
                case api.unlinkUser():
                    return this.unlinkUser(request);
                case api.getDevices():
                    return this.getDevices(request);
                case api.getDevicesState():
                    return this.getDevicesState(request);
                case api.setDeviceState():
                    return this.setDeviceState(request);
            }
        } catch (ex) {
            this._logger.warn(`error while process IoT request ${path}: ${ex.stack || ex.toString()}`);
            message = 'Internal server error';
        }

        return { code: message ? 500 : 404, body: { message: 'Unknown '} };
    }

    ping() {
        return { code: 200 };
    }

    unlinkUser({ externalUser, user, requestId }) {
        this._logger.info(`User ${user} (${externalUser}) unlinked`);
        return { code: 200, request_id: requestId };
    }

    getDevices({ externalUser, requestId }) {

    }

    getDevicesState({ body, externalUser, requestId }) {

    }

    setDeviceState({ body, externalUser, requestId }) {

    }
};
