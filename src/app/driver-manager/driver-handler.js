const EventEmitter = require('events');

const { config } = require('../../shared/service-config');
const logger = require('../../shared').LoggerService.getLogger('driver-handler');
const { Timer } = require('../../shared/utils/time');
const { notify } = require('../server/web-socket');
const { DriverActions } = require('../../shared/driver-model/driver-actions');
const { RequestResult } = require('../../shared/driver-model/request-result');
const { DriverProcess: DriverModel } = require('../../shared/driver-model/driver-process');
const protocol = require('../../shared/protocol');

const PROCESS_FAIL_MSG = 'Request failure (process closed)';

let driverManager;

/**
 * Manages renderer processes
 * @param {process} ps - node process
 * @constructor
 */
export class DriverHandler extends EventEmitter {
  /**
   * @param {string} name
   * @param {ChildProcess} ps
   */
  constructor(name, ps) {
    super();
    /**
     * @type {ChildProcess}
     */
    this.ps = ps;

    this.driverInfo = new DriverModel();
    this.queue = [];
    this.task = null;
    this.driverInfo.pid = ps.pid;
    this.driverInfo.name = name;
    this.driverInfo.state = DriverModel.STATE_STARTING;
    ps.on('message', this._onMessage.bind(this));
    ps.on('exit', this._onClose.bind(this));
    ps.on('disconnect', this._onClose.bind(this));
    this._pendingStartTimeout = setTimeout(this._startTimeoutElapsed.bind(this), config.driveInitTimeout);
    this._pendingRequestTaskTimeout = null;
    this._initRuntime();
  }

  static setManager(instance) {
    driverManager = instance;
  }

  _initRuntime() {
    logger.info(`initialization of driver ${this.driverInfo.name}`);
    this.ps.send({ command: protocol.handlerCommands.init, driver: this.driverInfo.name });
  }

  _kill() {
    try {
      if (!this.ps.killed) {
        this.ps.send({ command: protocol.handlerCommands.exit }, () => {});
        this.ps.kill();
      }
    } catch (e) {
    }
  }

  _onClose() {
    logger.info(`[${this.driverInfo.name}] driver process closed`);
    if (this.driverInfo.state !== DriverModel.STATE_CLOSED) {
      this._kill();
      clearTimeout(this._pendingRequestTaskTimeout);
      clearTimeout(this._pendingStartTimeout);
      this.driverInfo.state = DriverModel.STATE_CLOSED;
      if (this.task) {
        // return currently running task back to queue
        this.task.failedCount = (this.task.failedCount || 0) + 1;
        let result = new RequestResult(this.driverInfo.name, RequestResult.CODE_ERROR_INTERNAL, PROCESS_FAIL_MSG);
        this.task.complete(result);
        this.task = null;
      }
      notify({
        action: DriverActions.DiverUnloaded,
        name: this.driverInfo.name,
      });

      this.emit(DriverHandler.EVENT_DERIVER_CLOSED);
    }
  };

  _onMessage(msg) {
    if (msg && msg.command) {
      switch (msg.command) {
        case protocol.processorCommands.init:
          logger.info('Process is initializing');
          this.driverInfo.state = DriverModel.STATE_INITIALIZING;
          break;
        case protocol.processorCommands.ready:
          clearTimeout(this._pendingStartTimeout);
          this.driverInfo.memUsage = msg.mem;
          this.driverInfo.description = msg.description;
          this.driverInfo.apiMeta = msg.apiMeta;
          this.driverInfo.devices = msg.devices;
          this.emit(DriverHandler.EVENT_DERIVER_LOADED, {
            info: this.driverInfo,
            restApi: msg.restApi,
          });

          notify({
            action: DriverActions.DiverReady,
            name: this.driverInfo.name,
            info: this.driverInfo,
          });
          logger.info('Process is ready. Runtime init time: %dms, Mem: %dMB',
            msg.timing, Math.round(msg.mem / 1024 / 1024)
          );
          this.driverInfo.state = DriverModel.STATE_IDLE;
          this._checkQueueTask();
          break;
        case protocol.processorCommands.requestAccepted:
          logger.info('Process begin process request task %s', msg.method);
          this.driverInfo.state = DriverModel.STATE_REQUEST;
          this._pendingRequestTaskTimeout = setTimeout(
            this._requestTaskTimeoutElapsed.bind(this, msg.method),
            config.driverRequestTimeout,
          );
          break;
        case protocol.processorCommands.restResponse:
        case protocol.processorCommands.response:
          clearTimeout(this._pendingRequestTaskTimeout);
          this.driverInfo.memUsage = msg.mem;
          let memUsageMb = Math.round(msg.mem / 1024 / 1024);
          let duration = Timer.diff(this.task.start);
          logger.info(
            'Process %s completed request task %s with code %d. Time: %dms, Mem: %dMB',
            this.driverInfo.name,
            msg.method,
            msg.result.resultCode,
            duration,
            memUsageMb
          );

          if (memUsageMb > config.driverMaxMemoryMb) {
            logger.warn('Process %s has consumed too much memory (%dMB) and will be killed',
              this.driverInfo.name, memUsageMb);
            this._onClose();
            return;
          }
          this.driverInfo.state = DriverModel.STATE_IDLE;
          let result;
          if (msg.command === protocol.processorCommands.restResponse) {
            result = {
              code: msg.code,
              body: msg.body,
            };
          } else {
            result = new RequestResult(this.driverInfo.name, msg.result.resultCode, msg.result.data, duration);
          }
          this.task.complete(result);
          this._checkQueueTask();
          break;
        case protocol.processorCommands.request:
          driverManager.request(msg.data.driver, msg.data.method, msg.data.params)
            .then(result => {
              this.ps.send({ command: protocol.handlerCommands.response, id: msg.data.id, result });
            });
          break;
        case protocol.processorCommands.event:
          this.emit(
            DriverHandler.EVENT_DERIVER_BROADCAST,
            {
              source: this.driverInfo.name,
              eventName: msg.eventName,
              params: msg.params,
            }
          );
          break;
        case protocol.processorCommands.fault:
          logger.warn('Process fault: %d', msg.message);
          this.driverInfo.state = DriverModel.STATE_FAULT;
          notify({
            action: DriverActions.DiverError,
            name: this.driverInfo.name,
            reason: msg.message,
          });
          this._onClose();
          break;
        default:
          logger.warn('Unexpected process message: %s', msg.command);
          break;
      }
    }
  }

  _checkQueueTask() {
    this.task = this.queue.shift();
    if (this.task) {
      this._sendTask(this.task);
    } else if (this.stopping) {
      this._kill();
    }
  }

  _sendTask(task) {
    if (this.driverInfo.state === DriverModel.STATE_IDLE) {
      logger.info('Sending request %s to driver %s', task.method, this.driverInfo.name);
      task.start = Timer.start();
      try {
        let command;
        if (task.isRest) {
          command = {
            command: protocol.handlerCommands.restRequest,
            method: task.method,
            path: task.arg.path,
            requestData: task.arg.requestData,
          }
        } else {
          command = {
            command: protocol.handlerCommands.request,
            method: task.method,
            arg: task.arg,
          }
        }

        this.ps.send(command);
        this.task = task;
        this.driverInfo.state = DriverModel.STATE_REQUEST;
      } catch (err) {
        logger.warn('Error sending request %s to driver %s: ', task.method, this.driverInfo.name, err);
        this._onClose();
      }
    } else {
      logger.warn('Error sending request %s to driver %s: process is in wrong state (%s)',
        task.method, this.driverInfo.name, this.driverInfo.state);
      this._onClose();
    }
  }

  _startTimeoutElapsed() {
    logger.info('Process (%s) did not finished initializing within %d seconds and will be killed',
      this.driverInfo.name, Math.round(config.driveInitTimeout / 1000));
    this._onClose();
  }

  _requestTaskTimeoutElapsed(method) {
    logger.info('Process (%s) did not finished request %s within %d seconds and will be killed',
      this.driverInfo.name, method, Math.round(config.driverRequestTimeout / 1000));
    this._onClose();
  }

  queueTask(task) {
    if (this.ps.connected) {
      if (this.driverInfo.state === DriverModel.STATE_IDLE) {
        this.task = task;
        this._sendTask(this.task);
      } else {
        logger.info('Queue request "%s" to driver %s', task.method, this.driverInfo.name);
        this.queue.push(task);
      }
    } else {
      logger.warn(`Cannot queue task: process is not connected. Driver ${this.driverInfo.name}, method: ${task.method}`);
    }
  };

  stop(hard, processQueue) {
    this.stopping = true;
    this.driverInfo.state = DriverModel.STATE_STOPPING;
    if (hard) {
      processQueue = false;
      if (this.task) {
        this.queue.unshift(this.task);
      }
    }

    notify({
      action: DriverActions.DiverStopping,
      name: this.driverInfo.name,
    });

    if (!processQueue && this.queue.length) {
      logger.info('Dropped %d unfinished tasks from process', this.queue.length);
      for (let i = 0; i < this.queue.length; i++) {
        let task = this.queue[i];
        task.complete(new RequestResult(this.driverInfo.name, RequestResult.CODE_DRV_STOPPED, 'Driver is stopping'));
      }
      this.queue.length = 0;
    }

    if (hard || !this.task) {
      logger.info(`Killing process ${this.driverInfo.name}[${this.driverInfo.pid}]`);
      this._kill();
    }
  }

  sendEvent(event) {
    this.ps.send({ command: protocol.handlerCommands.event, params: event });
  }

  /**
   * Converts process to model process
   */
  toModel() {
    this.driverInfo.queueSize = this.queue.length;
    return this.driverInfo;
  }
}

DriverHandler.EVENT_DERIVER_BROADCAST = 'driver-event';
DriverHandler.EVENT_DERIVER_CLOSED = 'closed';
DriverHandler.EVENT_DERIVER_LOADED = 'loaded';
