import PublicMemberFlow from '../components/PublicMemberFlow';

export default function CheckOut({ attendance }) {
  const {
    members,
    searchMembers,
    publicSearchMembers,
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
      mode="check-out"
      members={members}
      searchMembers={publicSearchMembers || searchMembers}
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
