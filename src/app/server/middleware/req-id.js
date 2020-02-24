const uuid = require('uuid/v4');

const REQUEST_ID_HEADER = 'x-request-id';

export function reqId(req, res, next) {
    req.reuestId = req.headers[REQUEST_ID_HEADER] || uuid();
    next();
}
