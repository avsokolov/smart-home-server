const { LoggerService } = require('./shared');
const logger = LoggerService.getLogger('app');

process.on('uncaughtException', e => {
  logger.error(`Global unhandled exception: ${e.stack || e.message || e.toString()}`);
  setTimeout(() => process.exit(-1), 1000);
});

const { Server } = require('./app/server');
const { driverManager } = require('./app/driver-manager');
const { config } = require('./shared/service-config');

logger.info('service initialization...');
driverManager.startup()
  .then(() => logger.info('all drivers loaded'))
  .catch(reason => {
    logger.error('fail to load drivers: '+(reason.stack || reason.message || reason));
    setTimeout(() => process.exit(-1), 1000);
  });

const server = new Server();
config.on('reload', () => server.reload());
