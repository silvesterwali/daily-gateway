import Router from 'koa-router';
import validator, {
  object,
  string,
  boolean,
} from 'koa-context-validator';
import _ from 'lodash';
import { ForbiddenError, ValidationError } from '../errors';
import userModel from '../models/user';
import role from '../models/role';
import { setTrackingId } from '../tracking';
import config from '../config';
import { addSubdomainOpts } from '../cookies';
import upload from '../upload';
import { uploadAvatar } from '../cloudinary';
import { bootSharedLogic } from './boot';
import { validateRefreshToken } from '../auth';

const updateUser = async (userId, user, newProfile) => {
  await userModel.update(userId, newProfile);
};

const router = Router({
  prefix: '/users',
});

router.get(
  '/me',
  async (ctx) => {
    const shouldRefreshToken = await validateRefreshToken(ctx);
    const base = await bootSharedLogic(ctx, shouldRefreshToken);
    ctx.status = 200;
    ctx.body = {
      ...base.user,
      ...base.visit,
      accessToken: base.accessToken,
      registrationLink: base.registrationLink,
    };
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
      timezone: string().allow(null).max(50),
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
    ctx.body = _.pick(user, ['id', 'name', 'image', 'premium', 'username', 'bio', 'twitter', 'github', 'hashnode', 'timezone', 'portfolio', 'reputation', 'createdAt']);
  },
);

export default router;
