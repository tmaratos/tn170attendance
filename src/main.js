import {
  checkIn,
  checkOut,
  createPin,
  downloadCsv,
  getDashboardData,
  guestCheckIn,
  guestSearch,
  resetDemoData,
} from './store.js';

const app = document.querySelector('#app');

function fmtTime(value) {
  if (!value) return '';
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function initials(name) {
  return String(name).split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

function toast(result) {
  const box = document.querySelector('#message');
  box.className = result.ok ? 'message success' : 'message error';
  box.textContent = result.message;
  box.hidden = false;
  renderSidebar();
}

function renderSidebar() {
  const data = getDashboardData();
  const members = data.currentlyCheckedIn || [];
  const guests = data.currentlyCheckedInGuests || [];
  const countMembers = members.filter((row) => row.person?.memberType === 'Senior Member').length;
  const countCadets = members.filter((row) => row.person?.memberType === 'Cadet').length;
  const total = members.length + guests.length;

  document.querySelector('#checkedInList').innerHTML = [
    ...members.map((row) => `
      <li class="person-row">
        <span class="avatar">${initials(row.person?.fullName || '?')}</span>
        <span><strong>${row.person?.fullName || 'Unknown'}</strong><small>${row.person?.memberType || ''}</small></span>
        <time>${fmtTime(row.checkInTime)}</time>
      </li>
    `),
    ...guests.map((row) => `
      <li class="person-row guest">
        <span class="avatar">${initials(row.guest?.fullName || '?')}</span>
        <span><strong>${row.guest?.fullName || 'Guest'}</strong><small>Guest • Host: ${row.host?.fullName || 'Unknown'}</small></span>
        <time>${fmtTime(row.checkInTime)}</time>
      </li>
    `),
  ].join('') || '<li class="empty">Nobody is checked in yet.</li>';

  document.querySelector('#memberCount').textContent = countMembers;
  document.querySelector('#cadetCount').textContent = countCadets;
  document.querySelector('#guestCount').textContent = guests.length;
  document.querySelector('#totalCount').textContent = total;
}

function wireForms() {
  document.querySelector('#memberForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const action = form.get('action');
    const payload = { capid: form.get('capid'), pin: form.get('pin') };
    toast(action === 'checkOut' ? checkOut(payload) : checkIn(payload));
  });

  document.querySelector('#pinForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    toast(createPin({ capid: form.get('pinCapid'), newPin: form.get('newPin'), confirmPin: form.get('confirmPin') }));
    event.currentTarget.reset();
  });

  document.querySelector('#guestForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    toast(guestCheckIn({ guestName: form.get('guestName'), hostCapid: form.get('hostCapid'), hostPin: form.get('hostPin') }));
  });

  document.querySelector('#guestName').addEventListener('input', (event) => {
    const matches = guestSearch(event.target.value);
    document.querySelector('#guestMatches').innerHTML = matches.map((guest) => `<button type="button" data-name="${guest.fullName}">${guest.fullName}</button>`).join('');
  });

  document.querySelector('#guestMatches').addEventListener('click', (event) => {
    if (event.target.matches('button[data-name]')) {
      document.querySelector('#guestName').value = event.target.dataset.name;
      document.querySelector('#guestMatches').innerHTML = '';
    }
  });

  document.querySelector('#csvButton').addEventListener('click', () => {
    const blob = new Blob([downloadCsv()], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `tn-170-attendance-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  });

  document.querySelector('#pdfButton').addEventListener('click', () => window.print());
  document.querySelector('#resetDemo').addEventListener('click', () => {
    resetDemoData();
    toast({ ok: true, message: 'Demo data reset.' });
  });
}

function render() {
  app.innerHTML = `
    <aside class="sidebar">
      <div class="brand-lockup">
        <img src="./public/squadron-logo.jpeg" alt="Official Squadron Logo" />
        <div><strong>TN-170</strong><span>Attendance</span></div>
      </div>
      <nav>
        <a class="active" href="#kiosk">Kiosk</a>
        <a href="#guests">Guests</a>
        <a href="#reports">Reports</a>
        <a href="#members">Members</a>
        <a href="#admin">Admin</a>
      </nav>
      <div class="motto">NOT WITHOUT EFFORT</div>
    </aside>

    <main>
      <header class="topbar">
        <div>
          <p class="eyebrow">Civil Air Patrol • U.S. Air Force Auxiliary</p>
          <h1>TN-170 Attendance Kiosk</h1>
          <p>Oak Ridge Composite Squadron</p>
        </div>
        <div class="status-pill">System Ready</div>
      </header>

      <section class="layout">
        <div class="left-col">
          <section class="card hero-card" id="kiosk">
            <div class="card-title">
              <h2>Member Check-In / Check-Out</h2>
              <span>Validate first. Write second.</span>
            </div>
            <form id="memberForm" class="grid-form">
              <label>CAPID<input name="capid" inputmode="numeric" placeholder="Enter CAPID" required /></label>
              <label>PIN<input name="pin" type="password" inputmode="numeric" placeholder="4-digit PIN" required /></label>
              <div class="button-row">
                <button class="primary" name="action" value="checkIn">Check In</button>
                <button class="secondary" name="action" value="checkOut">Check Out</button>
              </div>
            </form>
          </section>

          <section class="card soft-card">
            <div>
              <h2>First-Time PIN Setup</h2>
              <p>Create a PIN only if you do not already have one.</p>
            </div>
            <form id="pinForm" class="inline-form">
              <input name="pinCapid" inputmode="numeric" placeholder="CAPID" required />
              <input name="newPin" type="password" inputmode="numeric" placeholder="New PIN" required />
              <input name="confirmPin" type="password" inputmode="numeric" placeholder="Confirm PIN" required />
              <button>Create PIN</button>
            </form>
          </section>

          <section class="card" id="guests">
            <div class="card-title">
              <h2>Guest Sign-In</h2>
              <span>Guest signs in under a host member.</span>
            </div>
            <form id="guestForm" class="grid-form guest-grid">
              <label>Guest Search or Name<input id="guestName" name="guestName" placeholder="Search guest or enter name" autocomplete="off" required /></label>
              <label>Host CAPID<input name="hostCapid" inputmode="numeric" placeholder="Host CAPID" required /></label>
              <label>Host PIN<input name="hostPin" type="password" inputmode="numeric" placeholder="Host PIN" required /></label>
              <div id="guestMatches" class="matches"></div>
              <button class="primary wide">Confirm Guest Sign-In</button>
            </form>
          </section>

          <div id="message" class="message" hidden></div>

          <section class="admin-grid" id="admin">
            <article class="tool-card"><h3>Manual Correction</h3><p>Senior member correction workflow placeholder.</p></article>
            <article class="tool-card"><h3>PIN Reset</h3><p>Reserved for Steven C Mellard, Ernest E Burchell, and Mel W Osborne.</p></article>
            <article class="tool-card"><h3>Member Management</h3><p>Firebase-backed roster management will go here.</p></article>
          </section>
        </div>

        <aside class="right-col">
          <section class="card checked-card">
            <div class="card-title"><h2>Currently Checked In</h2><span>Total: <strong id="totalCount">0</strong></span></div>
            <ul id="checkedInList" class="checked-list"></ul>
            <div class="summary-grid">
              <div><strong id="memberCount">0</strong><span>Senior Members</span></div>
              <div><strong id="cadetCount">0</strong><span>Cadets</span></div>
              <div><strong id="guestCount">0</strong><span>Guests</span></div>
            </div>
          </section>

          <section class="card" id="reports">
            <div class="card-title"><h2>Reports</h2><span>Senior member download</span></div>
            <p>Generate a CSV now. PDF is print-ready from the browser.</p>
            <div class="button-row">
              <button id="csvButton" class="secondary">Download CSV</button>
              <button id="pdfButton" class="danger">Save / Print PDF</button>
            </div>
          </section>

          <section class="card firebase-card">
            <h2>Firebase Ready</h2>
            <p>This starter uses a local demo adapter. Replace <code>src/store.js</code> with Firestore calls when your Firebase project is ready.</p>
            <button id="resetDemo" class="ghost">Reset Demo Data</button>
          </section>
        </aside>
      </section>
    </main>
  `;
  wireForms();
  renderSidebar();
}

render();
