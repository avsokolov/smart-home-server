import { SALT } from './constants';

const jwt = require('jsonwebtoken');
const crypt = require('bcryptjs');
const omit = require('lodash/omit');
const logger = require('../../../shared').LoggerService.getLogger('auth');
const { getUser } = require('./users-provider');
import { setAuthCookie } from './auth-utils';
import { checkRequest } from './check-auth';

export async function login(req, res) {
  const { login, password } = req.body;

  logger.info(`login request: ${login}/${password ? '*****' : '<empty>'}`);
  const user = getUser(login);
  if (user && await crypt.compare(password, user.password)) {
    const token: string = jwt.sign(
      { user: login },
      SALT,
      { expiresIn: '1y' }
    );

    setAuthCookie(res, token);
    res.json({ result: 'ok', token: token });

    return;
  }

  logger.warn('Wrong login');
  res.status(400).json({ result: 'Wrong login or password' });
}

export function oauth2Authorize(req, res) {
  if (!checkRequest(req)) {
    //auth required
    const LOGIN_URI = `https://${req.headers.host}/login?href=${encodeURIComponent(req.originalUrl)}`;

    return res
      .status(302)
      .set('Location', LOGIN_URI)
      .end();
  }

  //auth ok
  const target = req.query.redirect_uri;
  const userId = req.query.client_id;
  const state = req.query.state;
  const oauth2Token = jwt.sign(
    { user: req.user, externalUser: userId, },
    SALT,
    { expiresIn: '1y' }
  );

  return res
    .status(302)
    .set('Location', `${target}?state=${state}&code=${oauth2Token}`)
    .end();
}

export function oauth2AccessToken(req, res) {
  const token = req.body.code;
  const userId = req.body.client_id;
  const { user, externalUser } = jwt.verify(token, SALT);
  if (!user || externalUser !== userId) {
    return res.status(401).end();
  }

  const permanent = jwt.sign(
    { user, externalUser, },
    SALT,
    { expiresIn: '1y' }
  );
  const period = 86400000; //1d
  const temporary = jwt.sign({ user, externalUser }, SALT, { expiresIn: period });

  const data = {
    access_token: temporary,
    token_type: 'bearer',
    expires_in: period,
    refresh_token: permanent
  };

  return res
    .status(200)
    .json(data)
    .end();
}

export function profile(req, res) {
  res.status(200).json({
    ...omit(getUser(req.user), ['password']),
    login: req.user,
  });
}
