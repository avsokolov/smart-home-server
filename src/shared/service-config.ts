const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');

function getFileName() {
  const prodPath = path.resolve('./assets/service-config.json');
  if (fs.existsSync(prodPath)) {
    return prodPath;
  }

  return path.resolve('apps/smart-home-server/src/assets/service-config.json');
}

const FILE_NAME = getFileName();

class Config extends EventEmitter {
  constructor() {
    super();

    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    Object.assign(this, readConfig());
  }
}

export const config = new Config();

function readConfig() {
  return JSON.parse(fs.readFileSync(FILE_NAME).toString('utf8'));
}

function reloadFile() {
  const logger = require('./utils/logger').LoggerService;
  const log = logger.getLogger('config', process.pid);

    try {
        const data = readConfig();
        log.info('reloaded config: ', data);
        Object.keys(data).forEach(function(key) {
            config[key] = data[key];
        });
        try {
            config.emit('reload');
        } catch (ex) {
            log.error('reload handler has thrown an error, this is unexpected', ex);
        }
    } catch (err) {
        log.error('failed to reload config. working with old values...', err);
    }
}

fs.watchFile(FILE_NAME, reloadFile);
