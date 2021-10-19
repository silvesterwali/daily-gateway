import Redis from 'ioredis';
import rp from 'request-promise-native';
import config from './config';

const redis = new Redis(config.redis);

export default redis;

export const SECONDS_IN_A_MONTH = 2628288;

export const isRedisEmptyValue = (value) => value === undefined || value === null || value === '';

export const setRedisWithOneMonthExpiry = (key, value) => redis.set(key, value, 'EX', SECONDS_IN_A_MONTH);

export const setRedisAlerts = (key, obj) => setRedisWithOneMonthExpiry(key, JSON.stringify(obj));

export function deleteKeysByPattern(pattern) {
  return new Promise((resolve, reject) => {
    const stream = redis.scanStream({ match: pattern });
    stream.on('data', (keys) => {
      if (keys.length) {
        redis.unlink(keys);
      }
    });
    stream.on('end', resolve);
    stream.on('error', reject);
  });
}

export const getAlertsKey = (userId) => `alerts:${userId}`;

export const ALERTS_DEFAULT = { filter: true };

export const getAlertsFromAPI = async (ctx) => {
  const query = `{
    userAlerts {
      filter
    }
  }`;

  const res = await rp({
    method: 'POST',
    url: `${config.apiUrl}/graphql`,
    body: JSON.stringify({ query }),
    headers: {
      cookie: ctx.request.header.cookie,
      'content-type': 'application/json',
    },
  });

  return JSON.parse(res);
};

export const getAlerts = async (ctx) => {
  if (!ctx.state.user) {
    return ALERTS_DEFAULT;
  }

  const alertsKey = getAlertsKey(ctx.state.user.userId);
  const cache = await redis.get(alertsKey);

  if (isRedisEmptyValue(cache)) {
    try {
      const res = await getAlertsFromAPI(ctx);
      const alerts = res.data.userAlerts;

      await setRedisAlerts(alertsKey, alerts);

      return alerts;
    } catch (ex) {
      // TODO: use a dedicated logger for exceptions
    }
  }

  const alerts = JSON.parse(cache);

  return { ...ALERTS_DEFAULT, ...alerts };
};
