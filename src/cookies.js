import config from './config';
import { sign as signJwt } from './jwt';

const extractDomain = (ctx) => {
  const host = ctx.request.hostname;
  const parts = host.split('.');
  while (parts.length > 2) {
    parts.shift();
  }
  return parts.join('.');
};

export const addSubdomainOpts = (ctx, opts) => {
  const domain = extractDomain(ctx);
  return { ...opts, domain };
};

export const setAuthCookie = async (ctx, user, roles = []) => {
  const accessToken = await signJwt({ userId: user.id, premium: user.premium, roles },
    15 * 60 * 1000);
  ctx.cookies.set(
    config.cookies.auth.key, accessToken.token,
    addSubdomainOpts(ctx, config.cookies.auth.opts),
  );
  return accessToken;
};

export const getAmplitudeCookie = (ctx) => {
  const cookieName = `amp_${config.amplitudeKey.slice(0, 6)}_${extractDomain(ctx)}`;
  return ctx.cookies.get(cookieName);
};
