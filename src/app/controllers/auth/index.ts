import { Router } from 'express';
import { checkAuth, checkRequest } from './check-auth';
import { isAdmin } from './auth-utils';
import { login, oauth2AccessToken, oauth2Authorize, profile } from './api-implementation';

export { checkAuth, checkRequest, isAdmin }
export const router = Router();

router.post('/login', login);
router.get('/profile', checkAuth, profile);
router.get('/oauth2/authorize', oauth2Authorize);
router.post('/oauth2/access_token', oauth2AccessToken);
