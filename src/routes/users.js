import Router from 'koa-router';
import validator, {
  object,
  string,
  boolean,
} from 'koa-context-validator';
import _ from 'lodash';
import { ForbiddenError, ValidationError } from '../errors';
import provider from '../models/provider';
import userModel from '../models/user';
import refreshTokenModel from '../models/refreshToken';
import role from '../models/role';
import visit from '../models/visit';
import { setSessionId, setTrackingId } from '../tracking';
import config from '../config';
import { setAuthCookie, addSubdomainOpts, getAmplitudeCookie } from '../cookies';
import upload from '../upload';
import { uploadAvatar } from '../cloudinary';
import generateId from '../generateId';

const updateUser = async (userId, user, newProfile) => {
  await userModel.update(userId, newProfile);
};

const router = Router({
  prefix: '/users',
});

const validateRefreshToken = async (ctx) => {
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

const getMeBaseResponse = async (ctx, visitId, visitPromise, now, referral, user = null) => {
  const visitObject = visitPromise ? await visitPromise : null;
  const baseResponse = {
    ampStorage: getAmplitudeCookie(ctx),
    visitId,
    sessionId: ctx.sessionId,
  };
  if (visitObject) {
    const firstVisitEpoch = Math.min(
      getTimeOrMax(visitObject?.firstVisit),
      getTimeOrMax(user?.createdAt),
    );
    return {
      ...baseResponse,
      firstVisit: firstVisitEpoch < Number.MAX_VALUE ? new Date(firstVisitEpoch) : undefined,
      referrer: visitObject.referral,
    };
  }
  if (referral) {
    const referrer = await userModel.getByIdOrUsername(referral);
    if (referrer) {
      return {
        ...baseResponse,
        firstVisit: now,
        referrer: referrer.id,
      };
    }
  }
  return {
    ...baseResponse,
    firstVisit: now,
  };
};

router.get(
  '/me',
  async (ctx) => {
    const shouldRefreshToken = await validateRefreshToken(ctx);
    const trackingId = ctx.state?.user?.userId || ctx.trackingId;

    const visitId = generateId();
    generateSessionId(ctx);
    const now = new Date();
    const visitPromise = trackingId && visit.getFirstVisitAndReferral(trackingId);
    const referral = ctx.cookies.get(config.cookies.referral.key, config.cookies.referral.opts);
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

      ctx.status = 200;
      ctx.body = {
        ...user,
        providers: [userProvider.provider],
        roles,
        permalink: `${config.webappOrigin}/${user.username || user.id}`,
        accessToken,
        ...(await getMeBaseResponse(ctx, visitId, visitPromise, now, referral, user)),
      };
      if (!user.infoConfirmed) {
        ctx.body = {
          ...ctx.body, registrationLink: `${config.webappOrigin}/register`,
        };
      }
    } else {
      ctx.status = 200;
      const base = await getMeBaseResponse(ctx, visitId, visitPromise, now, referral);
      ctx.body = { id: trackingId, ...base };
    }

    updateUserVisit(ctx, now, referral, trackingId)
      .catch((err) => ctx.log.error({ err }, `failed to update visit for ${trackingId}`));
  },
);

router.put(
  '/me',
  validator({
    body: object().keys({
      name: string().required().trim().min(1)
        .max(50),
      email: string().email().required(),
      company: string().allow(null).max(50),
      title: string().allow(null).max(50),
      acceptedMarketing: boolean(),
      username: string().required().regex(/^@?(\w){1,15}$/),
      bio: string().allow(null).max(160),
      twitter: string().allow(null).regex(/^@?(\w){1,15}$/),
      github: string().allow(null).regex(/^@?([\w-]){1,39}$/i),
      hashnode: string().allow(null).regex(/^@?([\w-]){1,39}$/i),
      portfolio: string().allow(null),
    }),
  }, { stripUnknown: true }),
  async (ctx) => {
    if (ctx.state.user) {
      const { userId } = ctx.state.user;
      const user = await userModel.getById(userId);
      if (!user) {
        throw new ForbiddenError();
      }
      const { body } = ctx.request;
      ['username', 'twitter', 'github', 'hashnode'].forEach((key) => {
        if (body[key]) {
          body[key] = body[key].replace('@', '');
        }
      });
      const newProfile = {
        ...user,
        acceptedMarketing: true,
        ...body,
        infoConfirmed: true,
      };
      const dup = await userModel.checkDuplicateEmail(userId, newProfile.email);
      if (dup) {
        throw new ValidationError('email', 'email already exists');
      }
      ctx.log.info(`updating profile for ${userId}`);
      try {
        await updateUser(userId, user, newProfile);
      } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
          if (err.sqlMessage.indexOf('users_username_unique') > -1) {
            throw new ValidationError('username', 'username already exists');
          }
          if (err.sqlMessage.indexOf('users_twitter_unique') > -1) {
            throw new ValidationError('twitter', 'twitter handle already exists');
          }
          if (err.sqlMessage.indexOf('users_github_unique') > -1) {
            throw new ValidationError('github', 'github handle already exists');
          }
          if (err.sqlMessage.indexOf('users_hashnode_unique') > -1) {
            throw new ValidationError('hashnode', 'hashnode handle already exists');
          }
        }
        throw err;
      }
      ctx.body = newProfile;
      ctx.status = 200;
    } else {
      throw new ForbiddenError();
    }
  },
);

router.get(
  '/me/info',
  async (ctx) => {
    if (ctx.state.user) {
      const { userId } = ctx.state.user;
      const user = await userModel.getById(userId);
      if (!user) {
        throw new ForbiddenError();
      }
      ctx.body = { name: user.name, email: user.email };
      ctx.status = 200;
    } else {
      throw new ForbiddenError();
    }
  },
);

router.get(
  '/me/roles',
  async (ctx) => {
    if (ctx.state.user) {
      const { userId } = ctx.state.user;
      ctx.body = await role.getByUserId(userId);
      ctx.status = 200;
    } else {
      throw new ForbiddenError();
    }
  },
);

router.post(
  '/logout',
  async (ctx) => {
    setTrackingId(ctx, undefined);
    ctx.cookies.set(
      config.cookies.auth.key,
      undefined, addSubdomainOpts(ctx, config.cookies.auth.opts),
    );
    ctx.cookies.set(
      config.cookies.refreshToken.key,
      undefined, addSubdomainOpts(ctx, config.cookies.refreshToken.opts),
    );
    ctx.cookies.set(
      config.cookies.referral.key,
      undefined, addSubdomainOpts(ctx, config.cookies.referral.opts),
    );
    ctx.status = 204;
  },
);

router.post(
  '/me/image',
  async (ctx) => {
    if (ctx.state.user) {
      const { userId } = ctx.state.user;
      const { file } = await upload(ctx.req, { limits: { files: 1, fileSize: 5 * 1024 * 1024 } });
      ctx.log.info(`updating image for ${userId}`);
      const avatarUrl = await uploadAvatar(userId, file);
      const user = await userModel.getById(userId);
      const newProfile = {
        ...user,
        image: avatarUrl,
      };
      await updateUser(userId, user, newProfile);
      ctx.body = newProfile;
      ctx.status = 200;
    } else {
      throw new ForbiddenError();
    }
  },
);

router.get(
  '/:id',
  async (ctx) => {
    const user = await userModel.getByIdOrUsername(ctx.params.id);
    if (!user) {
      ctx.status = 404;
      return;
    }
    ctx.status = 200;
    ctx.body = _.pick(user, ['id', 'name', 'image', 'premium', 'username', 'bio', 'twitter', 'github', 'hashnode', 'portfolio', 'reputation', 'createdAt']);
  },
);

export default router;
