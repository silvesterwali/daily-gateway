import {
  messageToJson,
  participantEligilbleTopic,
  publishEvent,
  userDeletedTopic,
  userRegisteredTopic,
  userUpdatedTopic,
} from '../pubsub';

const onUserChange = async (log, data) => {
  if (data.payload.op === 'c') {
    await publishEvent(userRegisteredTopic, data.payload.after);
  } else if (data.payload.op === 'u') {
    await publishEvent(userUpdatedTopic,
      { user: data.payload.before, newProfile: data.payload.after });
  } else if (data.payload.op === 'd') {
    await publishEvent(userDeletedTopic, data.payload.before);
  }
};

const onReferralContestsChange = async (log, data) => {
  if (data.payload.op === 'u') {
    if (!data.payload.before.eligible && data.payload.after.eligible) {
      await publishEvent(participantEligilbleTopic, data.payload.after);
    }
  }
};

const worker = {
  topic: 'gateway.changes',
  subscription: 'gateway-cdc',
  handler: async (message, log) => {
    try {
      const data = messageToJson(message);
      if (data.schema?.name === 'io.debezium.connector.common.Heartbeat') {
        return;
      }
      switch (data.payload?.source?.table) {
        case 'users':
          await onUserChange(log, data);
          break;
        case 'referral_participants':
          await onReferralContestsChange(log, data);
          break;
        default:
        // Nothing here
      }
    } catch (err) {
      log.error(
        {
          messageId: message.messageId,
          err,
        },
        'failed to handle cdc message',
      );
      throw err;
    }
  },
};

export default worker;
