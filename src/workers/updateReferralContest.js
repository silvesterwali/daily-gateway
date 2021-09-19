import { messageToJson } from '../pubsub';
import userModel from '../models/user';
import contestModel from '../models/contest';
import visit from '../models/visit';

const worker = {
  topic: 'user-registered',
  subscription: 'user-registered-referral-contest',
  handler: async (message, log) => {
    const newUser = messageToJson(message);
    try {
      const visitObj = await visit.getFirstVisitAndReferral(newUser.id);
      if (visitObj?.referral) {
        const [referredUser, contest] = await Promise.all([
          userModel.getById(visitObj.referral),
          contestModel.getOngoingContest(),
        ]);
        if (referredUser && contest) {
          log.info({ userId: referredUser.id, contestId: contest.id }, 'increasing referral count for contest');
          await contestModel.incrementParticipantCount(contest.id, referredUser.id);
          const participant = await contestModel.getParticipant(contest.id, referredUser.id);
          if (participant.referrals >= 5 && !participant.eligible) {
            await contestModel.setParticipantAsEligible(contest.id, referredUser.id);
          }
        }
      }
    } catch (err) {
      log.error({ messageId: message.id, err }, 'failed to update referral contest');
      throw err;
    }
  },
};

export default worker;
