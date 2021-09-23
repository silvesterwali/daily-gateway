import Redis from 'ioredis';
import config from './config';

const redis = new Redis(config.redis);

export default redis;

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
