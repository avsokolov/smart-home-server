import { Request, Response } from 'express';
import { getUser } from './users-provider';

const AUTH_HEADER = 'x-auth-key';
const OAUTH2_HEADER = 'authorization';
const AUTH_COOKIE = 'token';

function getAuthCookie(cookies: string): string|undefined {
  const result = {};

  cookies && cookies.split(';').forEach(cookie => {
    const parts = cookie.split('=');
    result[parts.shift().trim()] = decodeURI(parts.join('='));
  });

  return result[AUTH_COOKIE];
}

export function getAuthHeaders(headers): { authToken?: string; oAuth2Token: string } {
  let oAuth2Token;
  if (headers[OAUTH2_HEADER]) {
    const [, token] = headers[OAUTH2_HEADER].split(' '); // should be "Bearer <token>"
    oAuth2Token = token;
  }

  let authToken = headers[AUTH_HEADER] || getAuthCookie(headers.cookie);
  return { oAuth2Token, authToken };
}

export function setAuthCookie(request: Request, response: Response, token: string);
export function setAuthCookie(response: Response, token: string);

export function setAuthCookie(...args) {
  let response: Response;
  let token: string;

  if (args.length === 3) {
    const [request] = args;
    [, response, token] = args;

    const cookies = getAuthCookie(request.headers.cookie);
    if (cookies[AUTH_COOKIE] === token) return;
  } else {
    [response, token] = args;
  }

  response.cookie(AUTH_COOKIE, token, { secure: true });
}

export function isAdmin(req, res, next) {
  const user = getUser(req.user);
  if (user && user.isAdmin) {
    next();
    return true;
  }

  res
    .status(403)
    .set('Content-Type', 'text/html')
    .send(new Buffer('<h6>Forbidden</h6>'));

  return false;
}

