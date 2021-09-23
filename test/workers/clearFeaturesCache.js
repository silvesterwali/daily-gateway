import supertest from 'supertest';
import { expect } from 'chai';
import flagsmith from 'flagsmith-nodejs';
import app from '../../src/background';
import worker from '../../src/workers/clearFeaturesCache';
import { expectSuccessfulBackground, mockChangeMessage, mockFeatureFlagForUser } from '../helpers';
import redis, { deleteKeysByPattern } from '../../src/redis';

const countByPattern = (pattern) => new Promise((resolve, reject) => {
  const stream = redis.scanStream({ match: pattern });
  let count = 0;
  stream.on('data', (keys) => {
    if (keys.length) {
      count += keys.length;
    }
  });
  stream.on('end', () => resolve(count));
  stream.on('error', reject);
});

describe('clear features cache', () => {
  let request;
  let server;

  before(() => {
    server = app.listen();
    request = supertest(server);
  });

  beforeEach(async () => {
    await deleteKeysByPattern('*');
  });

  after(() => {
    server.close();
  });

  it('should delete features cache', async () => {
    mockFeatureFlagForUser('feat_limit_dev_card', false);
    await flagsmith.getFlagsForUser('1');
    mockFeatureFlagForUser('feat_limit_dev_card', false);
    await flagsmith.getFlagsForUser('2');
    expect(await countByPattern('features:*')).to.equal(2);
    await expectSuccessfulBackground(
      request,
      worker,
      mockChangeMessage({
        after,
        op: 'c',
        table: 'users',
      }),
    );
    expect(await countByPattern('features:*')).to.equal(0);
  });
});
