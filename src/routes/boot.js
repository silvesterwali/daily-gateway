import Router from 'koa-router';
import { validateRefreshToken } from '../auth';
import generateId from '../generateId';
import visit from '../models/visit';
import flagsmith from '../flagsmith';
import config from '../config';
import userModel from '../models/user';
import provider from '../models/provider';
import role from '../models/role';
import { setSessionId, setTrackingId } from '../tracking';
import { ForbiddenError } from '../errors';
import { getAmplitudeCookie, setAuthCookie } from '../cookies';
import { getAlerts } from '../redis';

const router = Router({
  prefix: '/boot',
});

const generateSessionId = (ctx) => {
  if (!ctx.userAgent.isBot && !ctx.state.service) {
    if (!ctx.sessionId || !ctx.sessionId.length) {
      ctx.sessionId = generateId();
    }
    // Refresh session cookie
    setSessionId(ctx, ctx.sessionId);
  }
};

const updateUserVisit = async (ctx, now, referral, trackingId) => {
  if (!trackingId) {
    return;
  }
  const app = ctx.request.get('app');
  if (app === 'extension' || app === 'web') {
    const referrer = referral ? await userModel.getByIdOrUsername(referral) : {};
    await visit.upsert(trackingId, app, now, now, referrer?.id, ctx.request.ip);
  }
};

const getTimeOrMax = (time) => time?.getTime?.() || Number.MAX_VALUE;

const bootBaseResponse = async (ctx, visitId, visitPromise, now, referral, user = null) => {
  const visitObject = visitPromise ? await visitPromise : null;
  const baseResponse = {
    visit: {
      ampStorage: getAmplitudeCookie(ctx),
      visitId,
      sessionId: ctx.sessionId,
    },
  };
  if (visitObject) {
    const firstVisitEpoch = Math.min(
      getTimeOrMax(visitObject?.firstVisit),
      getTimeOrMax(user?.createdAt),
    );
    return {
      ...baseResponse,
      user: {
        firstVisit: firstVisitEpoch < Number.MAX_VALUE ? new Date(firstVisitEpoch) : undefined,
        referrer: visitObject.referral,
      },
    };
  }
  if (referral) {
    const referrer = await userModel.getByIdOrUsername(referral);
    if (referrer) {
      return {
        ...baseResponse,
        user: {
          firstVisit: now,
          referrer: referrer.id,
        },
      };
    }
  }
  return {
    ...baseResponse,
    user: {
      firstVisit: now,
    },
  };
};

const getTrackingId = (ctx) => ctx.state?.user?.userId || ctx.trackingId;

export const bootSharedLogic = async (ctx, shouldRefreshToken) => {
  const trackingId = getTrackingId(ctx);

  const visitId = generateId();
  generateSessionId(ctx);
  const now = new Date();
  const visitPromise = trackingId && visit.getFirstVisitAndReferral(trackingId);
  const referral = ctx.cookies.get(config.cookies.referral.key, config.cookies.referral.opts);
  let returnObject;
  if (ctx.state.user) {
    const { userId } = ctx.state.user;

    const [user, userProvider, roles] = await Promise.all([
      userModel.getById(userId),
      provider.getByUserId(userId),
      role.getByUserId(userId),
    ]);
    if (!user) {
      setTrackingId(ctx, null);
      throw new ForbiddenError();
    }

    const accessToken = shouldRefreshToken ? await setAuthCookie(ctx, user, roles) : undefined;

    const base = await bootBaseResponse(ctx, visitId, visitPromise, now, referral, user);
    returnObject = {
      ...base,
      user: {
        ...base.user,
        ...user,
        providers: [userProvider.provider],
        roles,
        permalink: `${config.webappOrigin}/${user.username || user.id}`,
      },
      accessToken,
    };
    if (!user.infoConfirmed) {
      returnObject = {
        ...returnObject,
        registrationLink: `${config.webappOrigin}/register`,
      };
    }
  } else {
    const base = await bootBaseResponse(ctx, visitId, visitPromise, now, referral);
    returnObject = {
      ...base,
      user: {
        ...base.user,
        id: trackingId,
      },
    };
  }

  updateUserVisit(ctx, now, referral, trackingId)
    .catch((err) => ctx.log.error({ err }, `failed to update visit for ${trackingId}`));

  return returnObject;
};

const getFeaturesForUser = async (ctx) => {
  const trackingId = getTrackingId(ctx);
  if (trackingId) {
    try {
      return await flagsmith.getFlagsForUser(trackingId);
    } catch (err) {
      ctx.log.error({ err }, 'failed to fetch feature flags');
    }
  }
  return null;
};

router.get('/', async (ctx) => {
  const shouldRefreshToken = await validateRefreshToken(ctx);
  const [flags, base, alerts] = await Promise.all([
    getFeaturesForUser(ctx),
    bootSharedLogic(ctx, shouldRefreshToken),
    getAlerts(ctx),
  ]);
  ctx.status = 200;
  ctx.body = {
    ...base,
    flags,
    alerts,
  };
});

export default router;
