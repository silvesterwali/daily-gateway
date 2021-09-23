import { deleteKeysByPattern } from '../redis';

const worker = {
  topic: 'features-reset',
  subscription: 'clear-features-cache',
  handler: async (message, log) => {
    try {
      log.info('clearing features cache');
      await deleteKeysByPattern('features:*');
    } catch (err) {
      log.error(
        {
          messageId: message.messageId,
          err,
        },
        'failed to clear features cache',
      );
      throw err;
    }
  },
};

export default worker;
