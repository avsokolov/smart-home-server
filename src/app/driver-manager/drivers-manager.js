const childProcess = require('child_process');
const fs = require('fs');
const EventEmitter = require('events');

const { notify } = require('../server/web-socket');
const logger = require('../../shared').LoggerService.getLogger('driver-manager');
const { config } = require('../../shared/service-config');

const { RequestResult, DriverActions } = require('../../shared');
const { DriverHandler } = require('./driver-handler');

const requireFunc = typeof __webpack_require__ === 'function' ? __non_webpack_require__ : require;

const defaultInspectPort = 9229;

class DriversManager extends EventEmitter {
  constructor() {
    super();
    this.drivers = {};
    this.watchers = {};
    this.ports = new Set();
  }

  /**
   * @param {string} name
   * @returns {Promise<DriverHandler>}
   * @private
   */
  _loadDriver(name) {
    return new Promise(async (ok) => {
      if (this.drivers[name]) {
        ok(this.drivers[name]);
      }

      let loader = requireFunc.resolve('./driver-loader');
      let driverPath = this._driverExists(name);
      if (!driverPath) {
        if (this.watchers[name]) {
          this.watchers[name].close();
          delete this.watchers[name];
        }
        ok(null);
        return;
      }

      if (!this.watchers[name]) {
        this.watchers[name] = fs.watch(driverPath, () => this._reloadDriver(name));
      }

      const options = {};
      let inspectPort = 0;
      if (process.execArgv.find(item => item.startsWith('--inspect'))) {
        inspectPort = defaultInspectPort + 1;
        while (this.ports.has(inspectPort)) {
          inspectPort++;
        }
        options.execArgv = [`--inspect=0.0.0.0:${inspectPort}`];
        this.ports.add(inspectPort);
      }

      let ps = new DriverHandler(name, childProcess.fork(loader, [], options));
      ps.inspectPort = inspectPort;
      this.drivers[name] = ps;
      notify({
        action: DriverActions.DiverLoaded,
        name,
      });
      ps.on(DriverHandler.EVENT_DERIVER_CLOSED, this._processClosed.bind(this, ps));
      ps.on(DriverHandler.EVENT_DERIVER_LOADED, this._processLoaded.bind(this));
      ps.on(DriverHandler.EVENT_DERIVER_BROADCAST, event => {
        this.emit('driver-event', event);
        Object.keys(this.drivers).forEach(driver => {
          if (driver !== event.source) {
            this.drivers[driver].sendEvent(event);
          }
        });
      });
      ok(ps);
    });
  }

  /**
   * @param {string} name
   * @returns {string|null}
   * @private
   */
  _driverExists(name) {
    try {
      return requireFunc.resolve(`./drivers/${name}`);
    } catch (ex) {
      return null;
    }
  }


  _reloadDriver(name) {
    if (this.drivers[name]) {
      //just stop it, it will be restarted by flow
      this.drivers[name].stop(false, true);
    }
  }

  _processLoaded(event) {
    this.emit(instance.Events.driverLoaded, event);
  }

  /**
   * @param {DriverHandler} ps
   * @private
   */
  async _processClosed(ps) {
    let driver = this.drivers[ps.driverInfo.name];
    if (driver) {
      this.emit(instance.Events.driverUnloaded, ps.driverInfo.name);
      delete this.drivers[ps.driverInfo.name];
    }

    if (ps.inspectPort) {
      this.ports.delete(ps.inspectPort);
    }

    if (!this.stopping) {
      let restartedDriver = await this._loadDriver(ps.driverInfo.name);

      if (!restartedDriver) {
        logger.warn('Driver %s tasks (%d) dropped', ps.driverInfo.name, ps.queue.length);
        ps.queue.forEach(task => {
          task.complete(new RequestResult(ps.driverInfo.name, RequestResult.CODE_DRV_NOT_READY, 'Fail to access driver'));
        });
      } else {
        logger.info(`driver ${restartedDriver.driverInfo.name} restarted`)
      }

      if (ps.queue.length) {
        logger.debug('Process %s (pid %d) had %d queued tasks', ps.driverInfo.name, ps.ps.pid, ps.queue.length);
        ps.queue.forEach(task => restartedDriver.queueTask(task));
      }
    }
  }


  async _enqueueTask(driverName, task) {
    let selectedProcess = this.drivers[driverName];

    if (!selectedProcess) {
      //Not loaded from config. Try dynamic load
      selectedProcess = await this._loadDriver(driverName);
    }

    logger.info(`request to ${driverName}. Exists: ${Object.keys(this.drivers).join(', ')}`);
    let resolver;
    const promise = new Promise(done => resolver = done);

    if (selectedProcess) {
      task.complete = response => {
        resolver(response)
      };
      Promise.resolve().then(() => selectedProcess.queueTask(task));
    } else {
      resolver(new RequestResult(driverName, RequestResult.CODE_DRV_NOT_READY, 'Fail to access driver'));
    }

    return await promise;
  }

  /**
   * Startup process manager and enter waiting state
   */
  startup() {
    logger.info('Starting service');
    this.stopping = false;
    return Promise.all(config.drivers.map(driver => this._loadDriver(driver)));
  }

  /**
   * Queues a new driver request
   */
  request(driverName, method, args) {
    return this._enqueueTask(driverName, {
      method: method,
      isRest: false,
      arg: args,
    });
  }


  restRequest(driverName, path, method, requestData) {
    return this._enqueueTask(driverName, {
      method: method,
      isRest: true,
      arg: {
        path,
        requestData,
      }
    });
  }

  /**
   * Gets model processes descriptions
   */
  getModelProcesses() {
    const model = {};
    Object.keys(this.drivers).forEach(driverName => {
      model[driverName] = this.drivers[driverName].toModel();
    });
    return model;
  }

  /**
   * Manages renderer processed creation and balancing
   */
}

export const instance = new DriversManager();
instance.Events = {
  driverLoaded: 'driver-loaded',
  driverUnloaded: 'driver-unloaded',
  driverEvent: 'driver-event',
};

DriverHandler.setManager(instance);
