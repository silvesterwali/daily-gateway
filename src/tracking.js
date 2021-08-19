import config from './config';
import { addSubdomainOpts } from './cookies';
import generateId from './generateId';

export const setTrackingId = (ctx, id) => {
  ctx.trackingId = id;
  ctx.cookies.set(
    config.cookies.tracking.key, id,
    addSubdomainOpts(ctx, config.cookies.tracking.opts),
  );
};

export const getTrackingId = (ctx) => {
  if (!ctx.trackingId || !ctx.trackingId.length) {
    ctx.trackingId = ctx.cookies.get(config.cookies.tracking.key, config.cookies.tracking.opts);
  }

  return ctx.trackingId;
};

export const setSessionId = (ctx, id) => {
  ctx.sessionId = id;
  ctx.cookies.set(
    config.cookies.session.key, id,
    addSubdomainOpts(ctx, config.cookies.session.opts),
  );
};

export const getSessionId = (ctx) => {
  if (!ctx.sessionId || !ctx.sessionId.length) {
    ctx.sessionId = ctx.cookies.get(config.cookies.session.key, config.cookies.session.opts);
  }

  return ctx.sessionId;
};

export default function verifyTracking(ctx, next) {
  if (!ctx.userAgent.isBot && !ctx.state.service) {
    let userId = getTrackingId(ctx);
    if (ctx.state.user) {
      // eslint-disable-next-line prefer-destructuring
      userId = ctx.state.user.userId;
    } else if (!userId || !userId.length) {
      userId = generateId();
    }

    if (userId !== getTrackingId(ctx)) {
      setTrackingId(ctx, userId);
    }

    ctx.sessionId = getSessionId(ctx);

    ctx.request.headers['user-id'] = userId;
  }
  return next();
}
