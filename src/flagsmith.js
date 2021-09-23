import flagsmith from 'flagsmith-nodejs';
import redisClient from './redis';
import config from './config';

const getKey = (key) => `features:${key}`;

flagsmith.init({
  environmentID: config.flagsmithKey,
  cache: {
    has: async (key) => {
      const reply = await redisClient.exists(getKey(key));
      return reply === 1;
    },
    get: async (key) => {
      const cacheValue = await redisClient.get(getKey(key));
      return cacheValue && JSON.parse(cacheValue);
    },
    set: async (key, value) => {
      await redisClient.set(getKey(key), JSON.stringify(value), 'ex', 60 * 60 * 24 * 30);
    },
  },
});

export default flagsmith;
