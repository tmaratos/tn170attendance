import PublicMemberFlow from '../components/PublicMemberFlow';

export default function CheckIn({ attendance }) {
  const {
    members,
    searchMembers,
    verifyPin,
    checkInMember,
    checkOutMember,
    isFirebase,
    memberHasPin,
    needsPinSetup,
    createMemberPin,
  } = attendance;

  return (
    <PublicMemberFlow
      mode="check-in"
      members={members}
      searchMembers={searchMembers}
      verifyPin={verifyPin}
      onCheckIn={checkInMember}
      onCheckOut={checkOutMember}
      isFirebase={isFirebase}
      memberHasPin={memberHasPin}
      needsPinSetup={needsPinSetup}
      createMemberPin={createMemberPin}
    />
  );
}
