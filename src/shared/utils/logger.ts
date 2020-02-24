import { Logger } from 'tslint/lib/runner';

const winston = require('winston');
const fs = require('fs');
const path = require('path');

const { config } = require('../service-config');

let loggers = {},
  defaultLogger,
  fileTransports = [],
  impl;

function ensureDirs() {
  Object.keys(config.logger)
    .filter(key => typeof key == 'string' && key.startsWith('file'))
    .map(key => config.logger[key])
    .forEach(fileName => {
      const dirName = path.dirname(path.resolve(fileName));
      if (!fs.existsSync(dirName)) {
        fs.mkdirSync(dirName);
      }
    });
}

function formatTimeStamp() {
  let dt = new Date();
  dt.setHours(dt.getHours() - dt.getTimezoneOffset() / 60);
  return dt.toISOString();
}

function createFileTransport(opts) {
  let transport = new winston.transports.File(opts);
  fileTransports.push(transport);
  return transport;
}

function reopenFile(fileTransport) {
  let fullname = path.join(fileTransport.dirname, fileTransport._getFile(false));

  if (fileTransport._stream) {
    fileTransport._stream.end();
    fileTransport._stream.destroySoon();
  }

  let stream = fs.createWriteStream(fullname, fileTransport.options);
  stream.setMaxListeners(Infinity);

  fileTransport._size = 0;
  fileTransport._stream = stream;

  fileTransport.once('flush', function () {
    fileTransport.opening = false;
    fileTransport.emit('open', fullname);
  });

  fileTransport.flush();
}

function reopenAllFiles() {
  ensureDirs();
  fileTransports.forEach(function (transport) {
    reopenFile(transport);
  });
}

function initImpl() {
  let transports = [new winston.transports.Console({
    colorize: true,
    timestamp: formatTimeStamp
  })];

  if (config.logger.file) {
    transports.push(createFileTransport({
      name: 'info-file',
      filename: config.logger.file,
      json: false,
      timestamp: formatTimeStamp
    }));
  }

  if (config.logger.fileWarn) {
    transports.push(createFileTransport({
      name: 'warn-file',
      filename: config.logger.fileWarn,
      level: 'warn',
      handleExceptions: true,
      json: false,
      timestamp: formatTimeStamp
    }));
  }

  if (config.logger.fileError) {
    transports.push(createFileTransport({
      name: 'error-file',
      filename: config.logger.fileError,
      level: 'error',
      handleExceptions: true,
      json: false,
      timestamp: formatTimeStamp
    }));
  }

  impl = new winston.Logger({
    transports: transports,
    level: config.logger.modules.default.toLowerCase(),
    exitOnError: false
  });
}

ensureDirs();
initImpl();

config.on('reload', function () {
  initImpl();
  Object.keys(loggers).forEach(key => {
    loggers[key].logLevel = LogLevel[config.logger.modules[loggers[key].module]] || LogLevel[config.logger.modules.default];
  });
});

/**
 * Log level for logger. Events with level lower then current level will be ignored,
 * @type {{none: number, errors: number, warnings: number, debug: number}}
 */
let LogLevel = {
  /**
   * No logging
   */
  OFF: 0,

  /**
   * Log errors only
   */
  ERROR: 1,

  /**
   * log warnings
   */
  WARN: 2,

  /**
   * Log info events
   */
  INFO: 3,

  /**
   * log all logger events
   */
  DEBUG: 4
};

/**
 * Logger class. Use for log some events like error, warning or debug info
 * @param {string} module - logger module name
 * @param {string} suffix - string to append after module
 * @constructor
 */
let Logger = function (module, suffix: string|number = '') {
  let self = this;

  self.module = module;
  self.suffix = suffix;
  self.logLevel = LogLevel[config.logger.modules[module] || config.logger.modules.default];

  /**
   * Error log
   * @param msg
   * @param args
   */
  self.error = function (msg, ...args) {
    if (self.logLevel < LogLevel.ERROR) {
      return;
    }
    args = [processMsg(msg)].concat(args);
    impl.error.apply(impl, args);
  };

  /**
   * Warning log
   * @param msg
   * @param args
   */
  self.warn = function (msg, ...args) {
    if (self.logLevel < LogLevel.WARN) {
      return;
    }
    args = [processMsg(msg)].concat(args);
    impl.warn.apply(impl, args);
  };

  /**
   * Info log
   * @param msg
   * @param args
   */
  self.info = function (msg, ...args) {
    if (self.logLevel < LogLevel.INFO) {
      return;
    }
    args = [processMsg(msg)].concat(args);
    impl.info.apply(impl, args);
  };

  /**
   * Debug log
   * @param msg
   * @param args
   */
  self.debug = function (msg, ...args) {
    if (self.logLevel < LogLevel.DEBUG) {
      return;
    }
    args = [processMsg(msg)].concat(args);
    impl.debug.apply(impl, args);
  };

  /**
   * Whether debug log is enabled
   * @return {boolean}
   */
  self.errorEnabled = function () {
    return self.logLevel >= LogLevel.ERROR;
  };

  /**
   * Whether debug log is enabled
   * @return {boolean}
   */
  self.warnEnabled = function () {
    return self.logLevel >= LogLevel.WARN;
  };

  /**
   * Whether debug log is enabled
   * @return {boolean}
   */
  self.infoEnabled = function () {
    return self.logLevel >= LogLevel.INFO;
  };

  /**
   * Whether debug log is enabled
   * @return {boolean}
   */
  self.debugEnabled = function () {
    return self.logLevel >= LogLevel.DEBUG;
  };

  /**
   * Log level
   */
  Object.defineProperty(self, 'level', {
    enumerable: true,
    get: function () {
      return self.logLevel;
    }
  });

  function processMsg(msg) {
    return '[' + module + (suffix ? ':' + suffix : '') + '] ' + msg;
  }
};

defaultLogger = new Logger('default');

/**
 * @param {String} module
 * @param {String|number} [suffix]
 * @returns {Logger}
 */
function getLogger(module:string, suffix?: string|number): Logger {
  if (!module) {
    return defaultLogger;
  }
  let key = module + suffix;
  let logger = loggers[key];
  if (!logger) {
    logger = new Logger(module, suffix);
    loggers[key] = logger;
  }
  return logger;
}

export const LoggerService = {
  instance: defaultLogger,
  loggers: loggers,
  getLogger: getLogger,
  LogLevel: LogLevel,
  createFileTransport: createFileTransport,
  reopenAllFiles: reopenAllFiles,
};
