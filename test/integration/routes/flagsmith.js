import { expect } from 'chai';
import supertest from 'supertest';

import sinon from 'sinon';
import app from '../../../src';
import * as pubsub from '../../../src/pubsub';
import { featuresResetTopic } from '../../../src/pubsub';

describe('flagsmith routes', () => {
  let request;
  let server;
  let publishEventStub;

  before(() => {
    server = app.listen();
    request = supertest(server);
  });

  beforeEach(() => {
    publishEventStub = sinon.stub(pubsub, 'publishEvent').returns(Promise.resolve());
  });

  afterEach(() => {
    sinon.restore();
  });

  after(() => {
    server.close();
  });

  it('should return 204 with wrong key', async () => {
    await request
      .post('/flagsmith/reset')
      .expect(204);

    expect(publishEventStub.callCount).to.equal(0);
  });

  it('should publish pubsub event', async () => {
    await request
      .post('/flagsmith/reset?key=key')
      .expect(204);

    expect(publishEventStub.calledWith(featuresResetTopic, {})).to.be.ok;
  });
});
