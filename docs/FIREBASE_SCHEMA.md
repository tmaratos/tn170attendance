# Firebase Schema Draft

This app is Firebase-ready but currently uses a local demo adapter in `src/store.js`.

## Collections

### members
- fullName: string
- capid: string
- pinHash: string (future secure version)
- pinSetStatus: "Set" | "Not Set"
- activeStatus: "Active" | "Inactive"
- memberType: "Senior Member" | "Cadet" | "Parent/Observer" | "Other"
- adminRole: "None" | "Attendance Admin" | "PIN Reset Admin" | "System Admin"
- notes: string
- lastPinResetBy: reference
- lastPinResetTime: timestamp

### meetings
- name: string
- date: string
- startTime: timestamp
- endTime: timestamp
- location: string
- status: "Scheduled" | "Active" | "Closed"

### attendance
- memberId: reference
- meetingId: reference
- checkInTime: timestamp
- checkOutTime: timestamp | null
- checkInMethod: "Kiosk" | "Admin" | "Manual Correction"
- checkOutMethod: "Kiosk" | "Admin" | "Manual Correction" | null
- attendanceStatus: "Checked In" | "Checked Out" | "Missing Check-Out" | "Corrected"
- manualCorrection: boolean
- correctionNotes: string

### guests
- fullName: string
- guestStatus: "Active Guest" | "Converted to Member" | "Do Not Admit" | "Archived"
- firstVisitDate: string
- lastVisitDate: string
- visitCount: number
- defaultHostMemberId: reference
- notes: string

### guestAttendance
- guestId: reference
- guestNameSnapshot: string
- hostMemberId: reference
- meetingId: reference
- checkInTime: timestamp
- checkOutTime: timestamp | null
- attendanceStatus: string
- confirmedByHost: reference
- hostVerificationTime: timestamp

### reportLogs
- reportName: string
- reportType: string
- generatedBy: reference
- generatedAt: timestamp
- format: "CSV" | "PDF"
