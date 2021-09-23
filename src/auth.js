import crypto from 'crypto';
import config from './config';
import refreshTokenModel from './models/refreshToken';
import { ForbiddenError } from './errors';

const base64URLEncode = (str) => str.toString('base64')
  .replace(/\+/g, '-')
  .replace(/\//g, '_')
  .replace(/=/g, '');

const sha256 = (buffer) => crypto.createHash('sha256').update(buffer).digest();

export const generateChallenge = (verifier) => base64URLEncode(sha256(verifier));

export const validateRefreshToken = async (ctx) => {
  const refreshToken = ctx.cookies.get(config.cookies.refreshToken.key);
  let shouldRefreshToken = false;
  if (refreshToken) {
    const refreshTokenObject = await refreshTokenModel.getByToken(refreshToken);
    if (refreshTokenObject) {
      shouldRefreshToken = true;
      ctx.state.user = { userId: refreshTokenObject.userId };
    } else {
      throw new ForbiddenError();
    }
  }
  return shouldRefreshToken;
};
