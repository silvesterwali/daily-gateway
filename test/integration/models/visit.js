import { expect } from 'chai';
import knexCleaner from 'knex-cleaner';
import db, { migrate } from '../../../src/db';
import visit from '../../../src/models/visit';

const users = [
  {
    id: '1',
    name: 'John',
    email: 'john@acme.com',
    image: 'https://acme.com/john.png',
  },
  {
    id: '2',
    name: 'John',
    email: 'john@acme.com',
    image: 'https://acme.com/john.png',
    title: 'Developer',
    company: 'ACME',
    username: 'john',
  },
];

describe('visit model', () => {
  beforeEach(async () => {
    await knexCleaner.clean(db, { ignoreTables: ['knex_migrations', 'knex_migrations_lock'] });
    await db.insert(users).into('users');
    return migrate();
  });

  it('should add new visit to db and then update', async () => {
    const date1 = new Date('2020-01-21T21:44:16');
    await visit.upsert('1', 'app', date1, date1, 'ido');
    const expected1 = await visit.get('1', 'app');
    expect(expected1).to.deep.equal({ visitedAt: date1, firstVisit: date1, referral: 'ido' });
    const date2 = new Date('2020-01-21T21:45:16');
    await visit.upsert('1', 'app', date2);
    const expected2 = await visit.get('1', 'app');
    expect(expected2).to.deep.equal({ visitedAt: date2, firstVisit: date1, referral: 'ido' });
  });

  it('should return first visit and empty referral', async () => {
    const date1 = new Date('2020-01-21T21:44:16');
    await visit.upsert('1', 'app', date1, date1, 'ido');
    const date2 = new Date('2020-01-21T21:45:16');
    await visit.upsert('1', 'webapp', date2, date2);
    const expected = await visit.getFirstVisitAndReferral('1');
    expect(expected).to.deep.equal({ firstVisit: date1, referral: null });
  });

  it('should return first visit and referral by id', async () => {
    const date1 = new Date('2020-01-21T21:44:16');
    await visit.upsert('1', 'app', date1, date1, '2');
    const date2 = new Date('2020-01-21T21:45:16');
    await visit.upsert('1', 'webapp', date2, date2);
    const expected = await visit.getFirstVisitAndReferral('1');
    expect(expected).to.deep.equal({ firstVisit: date1, referral: '2' });
  });

  it('should return first visit and referral by username', async () => {
    const date1 = new Date('2020-01-21T21:44:16');
    await visit.upsert('1', 'app', date1, date1, 'john');
    const date2 = new Date('2020-01-21T21:45:16');
    await visit.upsert('1', 'webapp', date2, date2);
    const expected = await visit.getFirstVisitAndReferral('1');
    expect(expected).to.deep.equal({ firstVisit: date1, referral: '2' });
  });
});
