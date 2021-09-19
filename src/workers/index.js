import slackNotification from './slackNotification';
import updateMailingList from './updateMailingList';
import updateReputation from './updateReputation';
import updateReferralContest from './updateReferralContest';
import eligibleParticipantNotification from './eligibleParticipantNotification';
import eligibleParticipantBoostChances from './eligibleParticipantBoostChances';
import cdc from './cdc';

const workers = [
  slackNotification,
  updateMailingList,
  updateReputation,
  updateReferralContest,
  eligibleParticipantNotification,
  eligibleParticipantBoostChances,
  cdc,
];

export default workers;
