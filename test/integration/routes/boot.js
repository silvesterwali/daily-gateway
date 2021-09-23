import knexCleaner from 'knex-cleaner';
import supertest from 'supertest';
import nock from 'nock';
import { expect } from 'chai';
import db, { migrate } from '../../../src/db';
import { deleteKeysByPattern } from '../../../src/redis';
import app from '../../../src';
import { sign } from '../../../src/jwt';
import { mockFeatureFlagForUser } from '../../helpers';
import role from '../../../src/models/role';
import userModel from '../../../src/models/user';
import provider from '../../../src/models/provider';
import refreshTokenModel from '../../../src/models/refreshToken';
import visit from '../../../src/models/visit';

describe('boot routes', () => {
  let request;
  let server;
  let accessToken;

  beforeEach(async () => {
    await knexCleaner.clean(db, { ignoreTables: ['knex_migrations', 'knex_migrations_lock'] });
    await deleteKeysByPattern('features:*');
    await userModel.add('1', 'John', 'john@daily.dev', 'https://daily.dev/john.jpg');
    await userModel.update('1', { username: 'john' });
    await provider.add('1', 'github', 'github_id');
    await refreshTokenModel.add('1', 'refresh');
    return migrate();
  });

  before(async () => {
    server = app.listen();
    request = supertest(server);
    accessToken = await sign({ userId: '1' }, null);
  });

  after(() => {
    server.close();
  });

  it('should return registered user profile', async () => {
    mockFeatureFlagForUser('feat_limit_dev_card', false);

    const res = await request
      .get('/boot')
      .set('Cookie', [`da3=${accessToken.token}`])
      .expect(200);

    expect(res.body.user.createdAt).to.be.a('string');
    expect(res.body.visit.visitId).to.be.a('string');
    expect(res.body.visit.sessionId).to.be.a('string');
    delete res.body.visit;
    delete res.body.user.createdAt;
    expect(res.body).to.deep.equal({
      user: {
        id: '1',
        providers: ['github'],
        name: 'John',
        image: 'https://daily.dev/john.jpg',
        email: 'john@daily.dev',
        infoConfirmed: false,
        premium: false,
        acceptedMarketing: true,
        roles: [],
        reputation: 1,
        permalink: 'http://localhost:5002/john',
        referralLink: 'https://api.daily.dev/get?r=john',
        firstVisit: res.body.user.firstVisit,
        username: 'john',
      },
      registrationLink: 'http://localhost:5002/register',
      flags: {
        feat_limit_dev_card: {
          enabled: false,
        },
      },
    });
  });

  it('should return profile with roles', async () => {
    await role.add('1', 'admin');
    await role.add('1', 'moderator');

    mockFeatureFlagForUser('feat_limit_dev_card', false);

    const res = await request
      .get('/boot')
      .set('Cookie', [`da3=${accessToken.token}`])
      .expect(200);

    expect(res.body.user.createdAt).to.be.a('string');
    expect(res.body.visit.visitId).to.be.a('string');
    expect(res.body.visit.sessionId).to.be.a('string');
    delete res.body.visit;
    delete res.body.user.createdAt;
    expect(res.body).to.deep.equal({
      user: {
        id: '1',
        providers: ['github'],
        name: 'John',
        image: 'https://daily.dev/john.jpg',
        email: 'john@daily.dev',
        infoConfirmed: false,
        premium: false,
        acceptedMarketing: true,
        roles: ['admin', 'moderator'],
        reputation: 1,
        permalink: 'http://localhost:5002/john',
        referralLink: 'https://api.daily.dev/get?r=john',
        firstVisit: res.body.user.firstVisit,
        username: 'john',
      },
      registrationLink: 'http://localhost:5002/register',
      flags: {
        feat_limit_dev_card: {
          enabled: false,
        },
      },
    });
  });

  it('should refresh access token when refresh token is available', async () => {
    const res = await request
      .get('/boot')
      .set('Cookie', ['da5=refresh'])
      .expect(200);

    expect(res.body.accessToken).to.be.a('object');
  });

  it('should throw forbidden error when refresh token is not valid', async () => {
    await request
      .get('/boot')
      .set('Cookie', ['da5=refresh2'])
      .expect(403);
  });

  it('should return first visit time and referral of anonymous user', async () => {
    const date1 = new Date('2020-01-21T21:44:16Z');
    const date2 = new Date('2020-01-21T21:45:16Z');
    await visit.upsert('123', 'app', date2, date1, '1', '');

    mockFeatureFlagForUser('feat_limit_dev_card', false);

    const res = await request
      .get('/boot')
      .set('Cookie', ['da2=123'])
      .expect(200);

    expect(res.body.user.firstVisit).to.equal('2020-01-21T21:44:16.000Z');
    expect(res.body.visit.visitId).to.be.a('string');
    expect(res.body.visit.sessionId).to.be.a('string');
    delete res.body.visit;
    expect(res.body).to.deep.equal({
      user: {
        id: '123',
        firstVisit: '2020-01-21T21:44:16.000Z',
        referrer: '1',
      },
      flags: {
        feat_limit_dev_card: {
          enabled: false,
        },
      },
    });
  });

  it('should return first visit time and referral when visit entry does not exist', async () => {
    mockFeatureFlagForUser('feat_limit_dev_card', false);

    const res = await request
      .get('/boot')
      .set('Cookie', ['da2=123;da4=john'])
      .expect(200);

    expect(res.body.user.firstVisit).to.a('string');
    expect(res.body.visit.visitId).to.be.a('string');
    expect(res.body.visit.sessionId).to.be.a('string');
    delete res.body.visit;
    expect(res.body).to.deep.equal({
      user: {
        id: '123',
        firstVisit: res.body.user.firstVisit,
        referrer: '1',
      },
      flags: {
        feat_limit_dev_card: {
          enabled: false,
        },
      },
    });
  });

  it('should return valid response when flagsmith returns error', async () => {
    nock('https://api.flagsmith.com')
      .filteringPath(/identifier=[^&]*/g, 'identifier=XXX')
      .get('/api/v1/identities/?identifier=XXX')
      .reply(500);

    const res = await request
      .get('/boot')
      .set('Cookie', ['da2=123'])
      .expect(200);

    expect(res.body.user.firstVisit).to.a('string');
    expect(res.body.visit.visitId).to.be.a('string');
    expect(res.body.visit.sessionId).to.be.a('string');
    delete res.body.visit;
    expect(res.body).to.deep.equal({
      user: {
        id: '123',
        firstVisit: res.body.user.firstVisit,
      },
      flags: null,
    });
  });

  it('should add visit entry', async () => {
    await request
      .get('/boot')
      .set('App', 'extension')
      .set('Cookie', ['da2=123;da4=john'])
      .expect(200);

    // Sleep as adding a new visit happens in the background
    await new Promise((resolve) => setTimeout(resolve, 50));
    const visitObj = await visit.get('123', 'extension');
    expect(visitObj.referral, '1');
  });

  it('should add visit entry with no referral', async () => {
    await request
      .get('/boot')
      .set('App', 'extension')
      .set('Cookie', ['da2=123;da4=john2'])
      .expect(200);

    // Sleep as adding a new visit happens in the background
    await new Promise((resolve) => setTimeout(resolve, 50));
    const visitObj = await visit.get('123', 'extension');
    expect(visitObj.referral, null);
  });
});
