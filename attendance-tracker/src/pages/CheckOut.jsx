import PublicMemberFlow from '../components/PublicMemberFlow';

export default function CheckOut({ attendance }) {
  const {
    searchMembers,
    publicSearchMembers,
    verifyPin,
    checkInMember,
    checkOutMember,
    isFirebase,
    needsPinSetup,
    createMemberPin,
  } = attendance;

  return (
    <PublicMemberFlow
      mode="check-out"
      attendance={attendance}
      searchMembers={publicSearchMembers || searchMembers}
      verifyPin={verifyPin}
      onCheckIn={checkInMember}
      onCheckOut={checkOutMember}
      isFirebase={isFirebase}
      needsPinSetup={needsPinSetup}
      createMemberPin={createMemberPin}
    />
  );
}
