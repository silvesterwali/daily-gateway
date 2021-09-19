import supertest from 'supertest';
import { expect } from 'chai';
import sinon from 'sinon';
import app from '../../src/background';
import worker from '../../src/workers/cdc';
import * as pubsub from '../../src/pubsub';
import { expectSuccessfulBackground, mockChangeMessage } from '../helpers';
import {
  participantEligilbleTopic, userDeletedTopic, userRegisteredTopic, userUpdatedTopic,
} from '../../src/pubsub';

describe('cdc', () => {
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

  const baseUser = {
    id: '1',
    username: 'idoshamun',
    name: 'Ido Shamun',
    created_at: new Date(2021, 9, 19).toISOString(),
    updated_at: new Date(2021, 9, 19).toISOString(),
  };

  it('should notify on a new user', async () => {
    const after = {
      ...baseUser,
    };
    await expectSuccessfulBackground(
      request,
      worker,
      mockChangeMessage({
        after,
        op: 'c',
        table: 'users',
      }),
    );
    expect(publishEventStub.calledWith(userRegisteredTopic, after)).to.be.ok;
  });

  it('should notify on user update', async () => {
    const after = {
      ...baseUser,
      name: 'Ido',
    };
    await expectSuccessfulBackground(
      request,
      worker,
      mockChangeMessage({
        before: baseUser,
        after,
        op: 'u',
        table: 'users',
      }),
    );
    expect(publishEventStub.calledWith(userUpdatedTopic,
      { user: baseUser, newProfile: after })).to.be.ok;
  });

  it('should notify on user deleted', async () => {
    await expectSuccessfulBackground(
      request,
      worker,
      mockChangeMessage({
        before: baseUser,
        op: 'd',
        table: 'users',
      }),
    );
    expect(publishEventStub.calledWith(userDeletedTopic, baseUser)).to.be.ok;
  });

  const baseParticipant = {
    contestId: 'c1',
    userId: '1',
    referrals: 3,
    eligible: false,
  };

  it('should notify on new eligible participant of the contest', async () => {
    const after = {
      ...baseParticipant,
      eligible: true,
    };
    await expectSuccessfulBackground(
      request,
      worker,
      mockChangeMessage({
        before: baseParticipant,
        after,
        op: 'u',
        table: 'referral_participants',
      }),
    );
    expect(publishEventStub.calledWith(participantEligilbleTopic, after)).to.be.ok;
  });

  it('should not notify on new eligible participant', async () => {
    const after = {
      ...baseParticipant,
      referrals: 5,
    };
    await expectSuccessfulBackground(
      request,
      worker,
      mockChangeMessage({
        before: baseParticipant,
        after,
        op: 'u',
        table: 'referral_participants',
      }),
    );
    expect(publishEventStub.callCount).to.equal(0);
  });
});
