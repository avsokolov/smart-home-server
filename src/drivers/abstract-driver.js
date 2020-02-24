const EventEmitter = require('events');

const { RequestResult, LoggerService } = require('../shared');

let handler;

class AbstractDriver extends EventEmitter {
    constructor(name, description, apiMeta, devices = null) {
        super();
        this._ready = false;
        this._name = name;
        this.description = description;
        this.devices = devices;
        this.apiMeta = apiMeta;
        this.interface = {};
        this._subscribtions = {};
        this.state = {};
        this._logger = LoggerService.getLogger(name, process.pid);
    }

    async init() {
        this._ready = true;
    }

    emit(eventName, params) {
        return super.emit('driver-event', {
            event: eventName,
            params: params
        })
    }

    setState(newState) {
        this.state = {
            ...this.state,
            ...newState,
        };

        this.emit('setState', this.state);
    }

    get ready() { return this._ready}

    checkRequestArgs(condition, msg = null) {
        if (!condition) {
            if (!msg) {
                msg = 'Bad arg';
            }

            const error = new Error(msg);
            error.code = RequestResult.CODE_REQUEST_ARG;
            throw error;
        }
    }

    notImplemented(msg = null) {
        if (!msg) {
            msg = 'method not implemented';
        }

        const error = new Error(msg);
        error.code = RequestResult.CODE_ERROR_NOT_IMPL;
        throw error;
    }

    static setProcessHandler(handlerInstance) {
        handler = handlerInstance;
    }

    handleEvent(name, event) {
        if (this._subscribtions[name]) {
            this._subscribtions[name].forEach(handler => handler(event));
        }
    }

    subscribe(event, handler) {
        if (!this._subscribtions[event]) {
            this._subscribtions[event] = [];
        }

        this._subscribtions[event].push(handler);

        return () => {
            if (!this._subscribtions[event]) {
                return;
            }

            let index = this._subscribtions[event].indexOf(handler);
            if (index!==-1) {
                this._subscribtions[event].splice(index, 1);
            }
        };
    }

    extRequest(driver, method, params) {
        return handler ? handler.extRequest(driver, method, params) : Promise.reject('No ext request handler');
    }
}

module.exports = AbstractDriver;
