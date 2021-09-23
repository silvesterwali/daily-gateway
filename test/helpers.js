import nock from 'nock';

function base64(i) {
  return Buffer.from(i, 'utf8').toString('base64');
}

export const mockMessage = (
  data,
) => {
  const message = {
    data: base64(JSON.stringify(data)),
    messageId: '1',
  };
  return { message };
};

export const invokeBackground = (
  request,
  worker,
  data,
) => request.post(`/${worker.subscription}`).send(mockMessage(data));

export const expectSuccessfulBackground = (
  request,
  worker,
  data,
) => invokeBackground(request, worker, data).expect(204);

export const mockChangeMessage = ({
  before,
  after,
  table,
  op,
}) => ({
  schema: {
    type: 'type',
    fields: [],
    optional: false,
    name: 'name',
  },
  payload: {
    before,
    after,
    source: {
      version: '1',
      connector: 'gateway',
      name: 'gateway',
      ts_ms: 0,
      snapshot: false,
      db: 'gateway',
      sequence: 's',
      schema: 'public',
      table,
      txId: 0,
      lsn: 0,
      xmin: 0,
    },
    op,
    ts_ms: 0,
    transaction: 0,
  },
});

export const mockFeatureFlagForUser = (
  featureName,
  enabled,
  value,
) => nock('https://api.flagsmith.com')
  .filteringPath(/identifier=[^&]*/g, 'identifier=XXX')
  .get('/api/v1/identities/?identifier=XXX')
  .reply(200, {
    flags: [
      {
        feature: { name: featureName },
        enabled,
        feature_state_value: value,
      },
    ],
  });
