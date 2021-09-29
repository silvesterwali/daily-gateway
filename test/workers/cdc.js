import supertest from 'supertest';
import { expect } from 'chai';
import sinon from 'sinon';
import knexCleaner from 'knex-cleaner';
import app from '../../src/background';
import worker from '../../src/workers/cdc';
import * as pubsub from '../../src/pubsub';
import { expectSuccessfulBackground, mockChangeMessage } from '../helpers';
import {
  participantEligilbleTopic, userDeletedTopic, userRegisteredTopic, userUpdatedTopic,
} from '../../src/pubsub';
import db, { migrate, toCamelCase } from '../../src/db';

describe('cdc', () => {
  let request;
  let server;
  let publishEventStub;

  before(() => {
    server = app.listen();
    request = supertest(server);
  });

  beforeEach(async () => {
    publishEventStub = sinon.stub(pubsub, 'publishEvent').returns(Promise.resolve());
    await knexCleaner.clean(db, { ignoreTables: ['knex_migrations', 'knex_migrations_lock'] });
    return migrate();
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
    created_at: new Date(2021, 9, 19),
    updated_at: new Date(2021, 9, 19),
  };

  it('should notify on a new user', async () => {
    await db.insert(baseUser).into('users');
    const [user] = await db.select().from('users').where('id', '=', baseUser.id).limit(1);
    await expectSuccessfulBackground(
      request,
      worker,
      mockChangeMessage({
        after: user,
        op: 'c',
        table: 'users',
      }),
    );
    expect(publishEventStub.calledWith(userRegisteredTopic, toCamelCase(user))).to.be.ok;
  });

  it('should notify on user update', async () => {
    await db.insert(baseUser).into('users');
    const [user] = await db.select().from('users').where('id', '=', baseUser.id).limit(1);
    const after = {
      ...user,
      name: 'Ido',
    };
    await db('users').update({ name: after.name }).where('id', '=', baseUser.id);
    await expectSuccessfulBackground(
      request,
      worker,
      mockChangeMessage({
        before: user,
        after,
        op: 'u',
        table: 'users',
      }),
    );
    expect(publishEventStub.calledWith(userUpdatedTopic,
      {
        user: toCamelCase({
          ...user,
          created_at: user.created_at.toISOString(),
          updated_at: user.updated_at.toISOString(),
        }),
        newProfile: toCamelCase(after),
      })).to.be.ok;
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
    expect(publishEventStub.calledWith(userDeletedTopic, toCamelCase({
      ...baseUser,
      created_at: baseUser.created_at.toISOString(),
      updated_at: baseUser.updated_at.toISOString(),
    }))).to.be.ok;
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
