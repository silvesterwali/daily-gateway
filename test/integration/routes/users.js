import { expect } from 'chai';
import supertest from 'supertest';
import nock from 'nock';
import knexCleaner from 'knex-cleaner';
import db, { migrate } from '../../../src/db';
import app from '../../../src';
import role from '../../../src/models/role';
import userModel from '../../../src/models/user';
import provider from '../../../src/models/provider';
import refreshTokenModel from '../../../src/models/refreshToken';
import { sign } from '../../../src/jwt';
import { generateChallenge } from '../../../src/auth';
import visit from '../../../src/models/visit';

describe('users routes', () => {
  let request;
  let server;

  beforeEach(async () => {
    await knexCleaner.clean(db, { ignoreTables: ['knex_migrations', 'knex_migrations_lock'] });
    return migrate();
  });

  before(() => {
    server = app.listen();
    request = supertest(server);
  });

  after(() => {
    server.close();
  });

  describe('me', () => {
    let accessToken;

    beforeEach(async () => {
      await userModel.add('1', 'John', 'john@daily.dev', 'https://daily.dev/john.jpg');
      await userModel.update('1', { username: 'john' });
      await provider.add('1', 'github', 'github_id');
      await refreshTokenModel.add('1', 'refresh');
      accessToken = await sign({ userId: '1' }, null);
    });

    it('should return registered user profile', async () => {
      const res = await request
        .get('/v1/users/me')
        .set('Cookie', [`da3=${accessToken.token}`])
        .expect(200);

      delete res.body.createdAt;
      expect(res.body).to.deep.equal({
        id: '1',
        providers: ['github'],
        name: 'John',
        image: 'https://daily.dev/john.jpg',
        email: 'john@daily.dev',
        username: 'john',
        infoConfirmed: false,
        premium: false,
        acceptedMarketing: true,
        roles: [],
        reputation: 1,
        permalink: 'http://localhost:5002/john',
        registrationLink: 'http://localhost:5002/register',
        referralLink: 'https://api.daily.dev/get?r=john',
        visitId: res.body.visitId,
        sessionId: res.body.sessionId,
        firstVisit: res.body.firstVisit,
      });
    });

    it('should return profile with roles', async () => {
      await role.add('1', 'admin');
      await role.add('1', 'moderator');

      const res = await request
        .get('/v1/users/me')
        .set('Cookie', [`da3=${accessToken.token}`])
        .expect(200);

      delete res.body.createdAt;
      expect(res.body).to.deep.equal({
        id: '1',
        providers: ['github'],
        name: 'John',
        image: 'https://daily.dev/john.jpg',
        email: 'john@daily.dev',
        username: 'john',
        infoConfirmed: false,
        premium: false,
        acceptedMarketing: true,
        roles: ['admin', 'moderator'],
        reputation: 1,
        permalink: 'http://localhost:5002/john',
        registrationLink: 'http://localhost:5002/register',
        referralLink: 'https://api.daily.dev/get?r=john',
        visitId: res.body.visitId,
        sessionId: res.body.sessionId,
        firstVisit: res.body.firstVisit,
      });
    });

    it('should refresh access token when refresh token is available', async () => {
      const res = await request
        .get('/v1/users/me')
        .set('Cookie', ['da5=refresh'])
        .expect(200);

      expect(res.body.accessToken).to.be.a('object');
    });

    it('should throw forbidden error when refresh token is not valid', async () => {
      await request
        .get('/v1/users/me')
        .set('Cookie', ['da5=refresh2'])
        .expect(403);
    });

    it('should return first visit time and referral', async () => {
      const date1 = new Date('2020-01-21T21:44:16Z');
      const date2 = new Date('2020-01-21T21:45:16Z');
      await visit.upsert('123', 'app', date2, date1, '1', '');

      const res = await request
        .get('/v1/users/me')
        .set('Cookie', ['da2=123'])
        .expect(200);

      expect(res.body).to.deep.equal({
        id: '123',
        firstVisit: '2020-01-21T21:44:16.000Z',
        referrer: '1',
        visitId: res.body.visitId,
        sessionId: res.body.sessionId,
      });
    });

    it('should return first visit time and referral when visit entry does not exist', async () => {
      const res = await request
        .get('/v1/users/me')
        .set('Cookie', ['da2=123;da4=john'])
        .expect(200);

      expect(res.body).to.deep.equal({
        id: '123',
        firstVisit: res.body.firstVisit,
        referrer: '1',
        visitId: res.body.visitId,
        sessionId: res.body.sessionId,
      });
    });

    it('should add visit entry', async () => {
      await request
        .get('/v1/users/me')
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
        .get('/v1/users/me')
        .set('App', 'extension')
        .set('Cookie', ['da2=123;da4=john'])
        .expect(200);

      // Sleep as adding a new visit happens in the background
      await new Promise((resolve) => setTimeout(resolve, 50));
      const visitObj = await visit.get('123', 'extension');
      expect(visitObj.referral, null);
    });
  });

  describe('me info', () => {
    it('should return github profile', async () => {
      nock('https://github.com')
        .post('/login/oauth/access_token', (body) => body.code === 'code')
        .reply(200, { access_token: 'token' });

      nock('https://api.github.com', {
        reqheaders: {
          Authorization: 'token token',
          'User-Agent': 'Daily',
        },
      })
        .get('/user/public_emails')
        .reply(200, [{ email: 'email@foo.com' }]);

      nock('https://api.github.com', {
        reqheaders: {
          Authorization: 'token token',
          'User-Agent': 'Daily',
        },
      })
        .get('/user')
        .reply(200, { id: 'github_id', name: 'user', avatar_url: 'https://avatar.com' });

      const verifier = 'verify';
      const code = await sign({ providerCode: 'code', provider: 'github', codeChallenge: generateChallenge(verifier) });
      const { headers } = await request
        .post('/v1/auth/authenticate')
        .send({ code: code.token, code_verifier: verifier })
        .expect(200);

      nock('https://api.github.com', {
        reqheaders: {
          Authorization: 'token token',
          'User-Agent': 'Daily',
        },
      })
        .get('/user')
        .reply(200, { id: 'github_id', name: 'user', avatar_url: 'https://avatar.com' });

      nock('https://api.github.com', {
        reqheaders: {
          Authorization: 'token token',
          'User-Agent': 'Daily',
        },
      })
        .get('/user/public_emails')
        .reply(200, [{ email: 'email@foo.com' }]);

      const res = await request
        .get('/v1/users/me/info')
        .set('Cookie', headers['set-cookie'])
        .expect(200);

      expect(res.body).to.deep.equal({
        name: 'user',
        email: 'email@foo.com',
      });
    });
  });

  describe('me roles', () => {
    it('should return user\'s roles', async () => {
      nock('https://github.com')
        .post('/login/oauth/access_token', (body) => body.code === 'code')
        .reply(200, { access_token: 'token' });

      nock('https://api.github.com', {
        reqheaders: {
          Authorization: 'token token',
          'User-Agent': 'Daily',
        },
      })
        .get('/user/public_emails')
        .reply(200, [{ email: 'email@foo.com' }]);

      nock('https://api.github.com', {
        reqheaders: {
          Authorization: 'token token',
          'User-Agent': 'Daily',
        },
      })
        .get('/user')
        .reply(200, { id: 'github_id', name: 'user', avatar_url: 'https://avatar.com' });

      const verifier = 'verify';
      const code = await sign({ providerCode: 'code', provider: 'github', codeChallenge: generateChallenge(verifier) });
      const { body, headers } = await request
        .post('/v1/auth/authenticate')
        .send({ code: code.token, code_verifier: verifier })
        .expect(200);

      await role.add(body.id, 'admin');
      await role.add(body.id, 'moderator');

      const res = await request
        .get('/v1/users/me/roles')
        .set('Cookie', headers['set-cookie'])
        .expect(200);

      expect(res.body).to.deep.equal(['admin', 'moderator']);
    });
  });

  describe('update info', () => {
    it('should update the logged-in user info', async () => {
      await userModel.add('id', 'John');
      const accessToken = await sign({ userId: 'id' }, null);

      const res = await request
        .put('/v1/users/me')
        .set('Cookie', [`da3=${accessToken.token}`])
        .set('Content-Type', 'application/json')
        .send({
          name: 'John', email: 'john@acme.com', company: 'ACME', title: 'Developer', username: 'john',
        })
        .expect(200);

      delete res.body.createdAt;
      expect(res.body).to.deep.equal({
        id: 'id',
        name: 'John',
        email: 'john@acme.com',
        company: 'ACME',
        title: 'Developer',
        infoConfirmed: true,
        premium: false,
        acceptedMarketing: true,
        reputation: 1,
        referralLink: 'https://api.daily.dev/get?r=id',
        username: 'john',
      });
    });

    it('should update the logged-in user timezone', async () => {
      await userModel.add('id', 'John');
      const accessToken = await sign({ userId: 'id' }, null);

      const res = await request
        .put('/v1/users/me')
        .set('Cookie', [`da3=${accessToken.token}`])
        .set('Content-Type', 'application/json')
        .send({
          name: 'John', email: 'john@acme.com', company: 'ACME', title: 'Developer', username: 'john', timezone: 'Pacific/Midway',
        })
        .expect(200);

      delete res.body.createdAt;
      expect(res.body).to.deep.equal({
        id: 'id',
        name: 'John',
        email: 'john@acme.com',
        company: 'ACME',
        title: 'Developer',
        infoConfirmed: true,
        premium: false,
        acceptedMarketing: true,
        reputation: 1,
        referralLink: 'https://api.daily.dev/get?r=id',
        username: 'john',
        timezone: 'Pacific/Midway',
      });
    });

    it('should discard "at" sign prefix from handles', async () => {
      await userModel.add('id', 'John');
      const accessToken = await sign({ userId: 'id' }, null);

      const res = await request
        .put('/v1/users/me')
        .set('Cookie', [`da3=${accessToken.token}`])
        .set('Content-Type', 'application/json')
        .send({
          name: 'John', email: 'john@acme.com', company: 'ACME', title: 'Developer', username: 'john', twitter: '@john',
        })
        .expect(200);

      delete res.body.createdAt;
      expect(res.body).to.deep.equal({
        id: 'id',
        name: 'John',
        email: 'john@acme.com',
        company: 'ACME',
        title: 'Developer',
        infoConfirmed: true,
        premium: false,
        acceptedMarketing: true,
        reputation: 1,
        referralLink: 'https://api.daily.dev/get?r=id',
        username: 'john',
        twitter: 'john',
      });
    });

    it('should allow hyphen in GitHub handle', async () => {
      await userModel.add('id', 'John');
      const accessToken = await sign({ userId: 'id' }, null);

      const res = await request
        .put('/v1/users/me')
        .set('Cookie', [`da3=${accessToken.token}`])
        .set('Content-Type', 'application/json')
        .send({
          name: 'John', email: 'john@acme.com', company: 'ACME', title: 'Developer', username: 'john', github: 'john-acme',
        })
        .expect(200);

      delete res.body.createdAt;
      expect(res.body).to.deep.equal({
        id: 'id',
        name: 'John',
        email: 'john@acme.com',
        company: 'ACME',
        title: 'Developer',
        infoConfirmed: true,
        premium: false,
        acceptedMarketing: true,
        reputation: 1,
        referralLink: 'https://api.daily.dev/get?r=id',
        username: 'john',
        github: 'john-acme',
      });
    });

    it('should update the accepted marketing field', async () => {
      await userModel.add('id', 'John');
      const accessToken = await sign({ userId: 'id' }, null);

      const res = await request
        .put('/v1/users/me')
        .set('Cookie', [`da3=${accessToken.token}`])
        .set('Content-Type', 'application/json')
        .send({
          name: 'John', email: 'john@acme.com', company: 'ACME', title: 'Developer', acceptedMarketing: true, username: 'john',
        })
        .expect(200);

      delete res.body.createdAt;
      expect(res.body).to.deep.equal({
        id: 'id',
        name: 'John',
        email: 'john@acme.com',
        company: 'ACME',
        title: 'Developer',
        infoConfirmed: true,
        premium: false,
        acceptedMarketing: true,
        reputation: 1,
        referralLink: 'https://api.daily.dev/get?r=id',
        username: 'john',
      });
    });

    it('should throw bad request on duplicate email', async () => {
      await userModel.add('id', 'John');
      await userModel.add('id2', 'John2', 'john@acme.com');
      const accessToken = await sign({ userId: 'id' }, null);

      const res = await request
        .put('/v1/users/me')
        .set('Cookie', [`da3=${accessToken.token}`])
        .set('Content-Type', 'application/json')
        .send({
          name: 'John', email: 'john@acme.com', company: 'ACME', title: 'Developer', username: 'john',
        })
        .expect(400);

      expect(res.body).to.deep.equal({
        code: 1,
        message: 'email already exists',
        field: 'email',
        reason: 'email already exists',
      });
    });

    it('should throw bad request on duplicate email when initial email is also the same', async () => {
      await userModel.add('id', 'John', 'john@acme.com');
      await userModel.add('id2', 'John2', 'john@acme.com');
      const accessToken = await sign({ userId: 'id' }, null);

      const res = await request
        .put('/v1/users/me')
        .set('Cookie', [`da3=${accessToken.token}`])
        .set('Content-Type', 'application/json')
        .send({
          name: 'John', email: 'john@acme.com', company: 'ACME', title: 'Developer', username: 'john',
        })
        .expect(400);

      expect(res.body).to.deep.equal({
        code: 1,
        message: 'email already exists',
        field: 'email',
        reason: 'email already exists',
      });
    });

    it('should throw bad request on duplicate username', async () => {
      await userModel.add('id', 'John');
      await userModel.add('id2', 'John2');
      await userModel.update('id2', { username: 'idoshamun' });
      const accessToken = await sign({ userId: 'id' }, null);

      const res = await request
        .put('/v1/users/me')
        .set('Cookie', [`da3=${accessToken.token}`])
        .set('Content-Type', 'application/json')
        .send({
          name: 'John', email: 'john@acme.com', username: 'IdoShamun',
        })
        .expect(400);

      expect(res.body).to.deep.equal({
        code: 1,
        message: 'username already exists',
        field: 'username',
        reason: 'username already exists',
      });
    });

    it('should throw bad request on duplicate twitter handle', async () => {
      await userModel.add('id', 'John');
      await userModel.add('id2', 'John2');
      await userModel.update('id2', { twitter: 'idoshamun' });
      const accessToken = await sign({ userId: 'id' }, null);

      const res = await request
        .put('/v1/users/me')
        .set('Cookie', [`da3=${accessToken.token}`])
        .set('Content-Type', 'application/json')
        .send({
          name: 'John', email: 'john@acme.com', twitter: 'IdoShamun', username: 'john',
        })
        .expect(400);

      expect(res.body).to.deep.equal({
        code: 1,
        message: 'twitter handle already exists',
        field: 'twitter',
        reason: 'twitter handle already exists',
      });
    });

    it('should throw bad request on duplicate github handle', async () => {
      await userModel.add('id', 'John');
      await userModel.add('id2', 'John2');
      await userModel.update('id2', { github: 'idoshamun' });
      const accessToken = await sign({ userId: 'id' }, null);

      const res = await request
        .put('/v1/users/me')
        .set('Cookie', [`da3=${accessToken.token}`])
        .set('Content-Type', 'application/json')
        .send({
          name: 'John', email: 'john@acme.com', github: 'IdoShamun', username: 'john',
        })
        .expect(400);

      expect(res.body).to.deep.equal({
        code: 1,
        message: 'github handle already exists',
        field: 'github',
        reason: 'github handle already exists',
      });
    });

    it('should throw bad request on duplicate hashnode handle', async () => {
      await userModel.add('id', 'John');
      await userModel.add('id2', 'John2');
      await userModel.update('id2', { hashnode: 'idoshamun' });
      const accessToken = await sign({ userId: 'id' }, null);

      const res = await request
        .put('/v1/users/me')
        .set('Cookie', [`da3=${accessToken.token}`])
        .set('Content-Type', 'application/json')
        .send({
          name: 'John', email: 'john@acme.com', hashnode: 'IdoShamun', username: 'john',
        })
        .expect(400);

      expect(res.body).to.deep.equal({
        code: 1,
        message: 'hashnode handle already exists',
        field: 'hashnode',
        reason: 'hashnode handle already exists',
      });
    });

    it('should throw bad request on invalid username', async () => {
      await userModel.add('id', 'John');
      const accessToken = await sign({ userId: 'id' }, null);

      const res = await request
        .put('/v1/users/me')
        .set('Cookie', [`da3=${accessToken.token}`])
        .set('Content-Type', 'application/json')
        .send({
          name: 'John', email: 'john@acme.com', username: 'john$%^',
        })
        .expect(400);

      expect(res.body).to.deep.equal({
        code: 1,
        field: 'username',
        message: 'child "username" fails because ["username" with value "john&#x24;&#x25;&#x5e;" fails to match the required pattern: /^@?(\\w){1,15}$/]',
        reason: '"username" with value "john&#x24;&#x25;&#x5e;" fails to match the required pattern: /^@?(\\w){1,15}$/',
      });
    });

    it('should throw bad request on whitespace name', async () => {
      await userModel.add('id', 'John');
      const accessToken = await sign({ userId: 'id' }, null);

      const res = await request
        .put('/v1/users/me')
        .set('Cookie', [`da3=${accessToken.token}`])
        .set('Content-Type', 'application/json')
        .send({
          name: '   ', email: 'john@acme.com', username: 'john$%^',
        })
        .expect(400);

      expect(res.body).to.deep.equal({
        code: 1,
        field: 'name',
        message: 'child "name" fails because ["name" is not allowed to be empty]',
        reason: '"name" is not allowed to be empty',
      });
    });
  });

  describe('get user profile', () => {
    it('should throw not found when no such user', async () => {
      await request
        .get('/v1/users/notfound')
        .expect(404);
    });

    it('should return profile by id', async () => {
      await userModel.add('id', 'John', 'john@acme.com', 'https://acme.com');
      await userModel.update('id', { username: 'idoshamun', bio: 'My bio' });

      const res = await request
        .get('/v1/users/id')
        .expect(200);

      delete res.body.createdAt;
      expect(res.body).to.deep.equal({
        id: 'id',
        name: 'John',
        image: 'https://acme.com',
        username: 'idoshamun',
        bio: 'My bio',
        premium: false,
        reputation: 1,
      });
    });

    it('should return profile by username', async () => {
      await userModel.add('id', 'John', 'john@acme.com', 'https://acme.com');
      await userModel.update('id', { username: 'idoshamun', bio: 'My bio' });

      const res = await request
        .get('/v1/users/idoshamun')
        .expect(200);

      delete res.body.createdAt;
      expect(res.body).to.deep.equal({
        id: 'id',
        name: 'John',
        image: 'https://acme.com',
        username: 'idoshamun',
        bio: 'My bio',
        premium: false,
        reputation: 1,
      });
    });
  });
});
