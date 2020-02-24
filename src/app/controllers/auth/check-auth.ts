import { SALT } from './constants';

const jwt = require('jsonwebtoken');
import { getAuthHeaders, setAuthCookie } from './auth-utils';

const DEV_MODE = process.env.DEV_MODE;
if (DEV_MODE) {
  logger.info('Auth developer mode');
}

export function checkRequest(req) {
  try {
    const { authToken, oAuth2Token } = getAuthHeaders(req.headers);
    let token = oAuth2Token || authToken;
    if (!token && DEV_MODE) {
      token = req.query.key
    }

    if (DEV_MODE && token === 'api') {
      req.user = 'DEV';
      req.token = '123';
      return true;
    } else if (token) {
      const { user, externalUser } = jwt.verify(token, SALT);
      req.user = user;
      req.token = token;
      if (externalUser) {
        req.externalUser = externalUser;
      }

      return true;
    }
  } catch (ex) {
    logger.warn(`auth fail: ${ex.message}`);
  }

  return false;
}

export function checkAuth(req, res, next) {
  if (checkRequest(req)) {
    setAuthCookie(req, res, req.token);

    if (next) {
      next();
    }

    return true;
  }

  if (res) {
    res
      .status(401)
      .set('Content-Type', 'text/html')
      .send(new Buffer('<h6>Auth required</h6>'));
  }

  return false;
}
