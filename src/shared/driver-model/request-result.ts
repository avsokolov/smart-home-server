const logger = require('../utils/logger').LoggerService.getLogger('request-result');

/**
 * Renderer convert result
 * @param {number} resultCode
 * @param {string} [message]
 * @constructor
 */
export class RequestResult {
  response: any;
  requestDuration: number;

  constructor(driverName, public resultCode, message: string, duration = 0) {
        this.response = message;
        this.requestDuration = duration;
        let asString = typeof message === 'string' ? message : JSON.stringify(message);
        if (this.resultCode === RequestResult.CODE_OK) {
            logger.debug('Request to %s done. Message: %s', driverName, asString);
        } else {
            logger.debug('Request to %s fail with code: %d and message "%s"', driverName, resultCode, asString);
        }

        Object.preventExtensions(this);
    }

  static CODE_OK = 0;
  static CODE_ERROR_NOT_IMPL = 1;
  static CODE_ERROR_QUEUE_FULL = 2;
  static CODE_ERROR_INTERNAL = 100;
  static CODE_DRV_STOPPED = 101;
  static CODE_REQUEST_ARG = 102;
  static CODE_DRV_NOT_READY = 103;
}
