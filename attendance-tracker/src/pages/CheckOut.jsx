import CheckOutWizard from '../components/CheckOutWizard';

export default function CheckOut({ attendance }) {
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
    <div className="kiosk-page">
      <CheckOutWizard
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
    </div>
  );
}
