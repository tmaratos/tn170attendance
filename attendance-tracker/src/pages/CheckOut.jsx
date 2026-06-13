import CheckOutWizard from '../components/CheckOutWizard';
import CheckoutReminder from '../components/CheckoutReminder';

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
    <div className="kiosk-page tablet-kiosk-page">
      <CheckoutReminder />
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
