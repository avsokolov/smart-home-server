let log = null;
process.on('uncaughtException', handleUncachedError);
process.on('unhandledRejection', handleUncachedError);
process.on('SIGTERM', () => {
  (log || console).info('Driver unload because SIGTERM');
  process.exit(0);
});

const { LoggerService: Logger, Timer: time, RequestResult } = require('./shared');
const protocol = require('./shared/protocol');
const requireFunc = require('./shared/native-require');

const AbstractDriver = requireFunc('./drivers/abstract-driver');
log = Logger.getLogger('driver-process');
let driver = null;
let driverName = '';
let extRequests = {};
let newId = 1;

function handleUncachedError(e) {
  (log || console).error(`Driver-loader unhandled exception: ${e.stack || e.message || e.toString()}`);
  setTimeout(() => process.exit(-1), 1000);
}

AbstractDriver.setProcessHandler({
  extRequest: (driver, method, params) => {
    return new Promise((ok, fail) => {
      const id = ++newId;
      extRequests[id] = { ok, fail };
      process.send({
        command: protocol.processorCommands.request,
        data: { id, driver, method, params }
      });
    });
  }
});

process.on('message', function (msg) {
  log.info(`processing driver command ${msg.command}`);
  switch (msg.command) {
    case protocol.handlerCommands.init:
      handleInit(msg);
      break;
    case protocol.handlerCommands.request:
      handleRequest(msg);
      break;
    case protocol.handlerCommands.event:
      handleEvent(msg.params);
      break;
    case protocol.handlerCommands.response:
      handleResponse(msg);
      break;
    case protocol.handlerCommands.restRequest:
      handleRestRequest(msg);
      break;
    case protocol.handlerCommands.exit:
      process.exit(0);
      break;
    default:
      log.warn('Unknown process handler message:', msg);
  }
});

function sendRestResponse(code, body) {
  process.send({
    command: protocol.processorCommands.restResponse,
    mem: process.memoryUsage().rss,
    result: { resultCode: 0 },
    code,
    body,
  });
}

async function handleRestRequest(msg) {
  if (!driver.restRequest) {
    return sendRestResponse(404, { message: '404 - resource not found' });
  }

  try {
    let result = driver.restRequest(msg.method, msg.path, msg.requestData);
    if (result instanceof Promise) {
      result = await result;
    }

    const { code, body } = result;
    sendRestResponse(code, body);
  } catch (ex) {
    log.warn(`Error while process rest request to ${msg.path} with driver ${driverName}: ${ex.stack || ex.message || ex}`);
    sendRestResponse(500, { message: 'Internal server error' });
  }
}

function handleResponse(msg) {
  if (!extRequests[msg.id]) {
    log.warn('response reserved with wrong request id %d', msg.id);
    return;
  }

  if (msg.result.resultCode !== RequestResult.CODE_OK) {
    extRequests[msg.id].fail(msg.result.response);
  } else {
    extRequests[msg.id].ok(msg.result.response);
  }
}

async function handleInit(msg) {
  process.send({ command: protocol.processorCommands.init });
  try {
    driverName = msg.driver;
    let DriverClass = requireFunc('./drivers/' + driverName);
    driver = new DriverClass(driverName);
    driver.on('driver-event', handleDriverEvent);

    log.info(`created instance of ${driverName}. Initialization...`);
    let initTime = time.start();
    await driver.init();
    initTime = time.diff(initTime);
    log.info('driver init complete');

    const driverInfo = {
      apiMeta: driver.apiMeta,
      devices: driver.devices,
      description: driver.description,
    } as any;
    if (driver.restApi) {
      driverInfo.restApi = driver.restApi;
    }
    process.send({
      ...driverInfo,
      command: protocol.processorCommands.ready,
      timing: initTime,
      mem: process.memoryUsage().rss,
    });
    log.info('driver %s init complete', driverName)
  } catch (ex) {
    log.warn(`Error while loading driver ${driverName}: ${ex.stack || ex.message || ex}`);
  }
}

function handleDriverEvent(e) {
  process.send({
    command: protocol.processorCommands.event,
    eventName: e.event,
    params: e.params
  });
}

function handleEvent(data) {
  try {
    log.info('event "%s" from %s to driver %s', data.eventName, data.source, driverName);
    driver.handleEvent(data.eventName, data.params);
  } catch (ex) {
    if (ex.code) {
      log.warn(ex.message);
    } else {
      log.error('Error while processing event %s: %s', data.eventName, ex.stack || ex.message || ex);
    }
  }
}

async function handleRequest(msg) {
  process.send({ command: protocol.processorCommands.requestAccepted, method: msg.method });
  log.info('new request "%s" to driver %s', msg.method, driverName);

  if (!driver || !driver.ready) {
    sendResult(msg.method, RequestResult.CODE_DRV_NOT_READY, 'Init is not complete');
    return;
  }

  if (!msg.method || !driver.interface[msg.method]) {
    sendResult(msg.method, RequestResult.CODE_ERROR_NOT_IMPL, 'Driver method not exists');
    return;
  }

  try {
    let result = driver.interface[msg.method](msg.arg);
    if (result instanceof Promise) {
      result = await result;
    }
    sendResult(msg.method, RequestResult.CODE_OK, result)
  } catch (ex) {
    let code;
    let errorMsg;
    if (ex.code) {
      errorMsg = ex.message;
      code = ex.code;
      log.warn(ex.message);
    } else {
      errorMsg = 'Unhandled error while processing request: ' + (ex.message || ex);
      code = RequestResult.CODE_ERROR_INTERNAL;
      log.error('Error while processing request %s: %s', msg.method, ex.stack || ex.message || ex);
    }

    sendResult(msg.method, code, errorMsg);
  }
}

function sendResult(method, code, result) {
  process.send({
    method: method,
    command: protocol.processorCommands.response,
    result: {
      resultCode: code,
      data: result
    },
    mem: process.memoryUsage().rss
  });
}
