import Router from 'koa-router';
import config from '../config';
import { featuresResetTopic, publishEvent } from '../pubsub';

const router = Router({
  prefix: '/flagsmith',
});

router.post('/reset', async (ctx) => {
  const { key } = ctx.request.query;
  if (key === config.flagsmithKey) {
    await publishEvent(featuresResetTopic, {});
  }
  ctx.status = 204;
});

export default router;
