import { messageToJson } from '../pubsub';
import { getContactIdByEmail, removeUserFromList, updateUserContact } from '../mailing';

const worker = {
  topic: 'user-updated',
  subscription: 'user-updated-mailing',
  handler: async (message, log) => {
    const data = messageToJson(message);
    if (!data.newProfile.email || !data.newProfile.email.length) {
      log.warn({ messageId: message.id, userId: data.user.id }, 'no email in user-updated message');
      return;
    }
    try {
      const lists = ['85a1951f-5f0c-459f-bf5e-e5c742986a50'];
      if (!data.newProfile.acceptedMarketing) {
        const contactId = await getContactIdByEmail(data.user.email);
        if (contactId) {
          await removeUserFromList('53d09271-fd3f-4e38-ac21-095bf4f52de6', contactId);
        }
      } else {
        lists.push('53d09271-fd3f-4e38-ac21-095bf4f52de6');
      }
      await updateUserContact(data.newProfile, data.user.email, lists);
    } catch (err) {
      if (err.code === 400
        && err.response?.body?.errors?.[0]?.message === 'length should be less than 50 chars') {
        log.warn({ messageId: message.id, err, userId: data.user.id }, 'skipped updating user in mailing list');
      } else {
        log.error({ messageId: message.id, err, userId: data.user.id }, 'failed to update user in mailing list');
        throw err;
      }
    }
  },
};

export default worker;
