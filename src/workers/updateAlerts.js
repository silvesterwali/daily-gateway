import { messageToJson } from '../pubsub';
import { getAlertsKey, setRedisAlerts } from '../redis';

const handler = async (message, log) => {
  try {
    const data = messageToJson(message);
    const key = getAlertsKey(data.userId);

    setRedisAlerts(key, data);
  } catch (err) {
    log.error(
      { messageId: message.messageId, err },
      "failed to set value for user's alerts cache",
    );
    throw err;
  }
};

const worker = {
  topic: 'alerts-updated',
  subscription: 'alerts-updated-redis',
  handler,
};

export default worker;
