/* =============================================
   LEE HAYWARD PT — ADMIN DASHBOARD JS
   Mock data, client management, interactions
   ============================================= */

/* === MOCK DATA === */
const CLIENTS = [
  {
    id: 1,
    firstName: 'Marcus',
    lastName:  'Thorne',
    email:     'marcus.t@corporate.com',
    phone:     '+44 7700 900001',
    status:    'active',
    tier:      'Elite Performance',
    program:   '1-on-1 Training',
    joined:    '2024-01-15',
    phase:     'Hypertrophy',
    progress:  75,
    goal:      'Build Muscle',
    weight:    92,
    targetWeight: 95,
    strengthIndex: 88,
    volumeConsistency: 94,
    nutritionCompliance: 82,
    personalBest: { lift: 'Deadlift', weight: 260 },
    strengthGain: '+22%',
    notes: 'Highly motivated. Responds well to high volume. Watch lower back on deadlift days.',
    weightHistory: [88, 89, 89.5, 90, 90.5, 91, 91.5, 92, 92, 92.3, 92.5, 92],
    recentActivity: [
      { type: 'workout', title: 'Upper Body Push A', time: 'Yesterday at 16:30', duration: '65 mins', status: 'completed' },
      { type: 'nutrition', title: 'Nutrition Log Updated', time: '3 hours ago', calories: '3200 kcal', status: '' },
      { type: 'workout', title: 'Lower Body Power', time: '2 days ago', duration: '70 mins', status: 'completed' },
    ],
    upcomingSchedule: [
      { date: '14', month: 'APR', title: 'Upper Body Pull B', subtitle: 'Target: Lat Width & Rear Delts' },
      { date: '16', month: 'APR', title: 'Active Recovery / Mobility', subtitle: 'Low intensity steady state + Foam Rolling' },
      { date: '18', month: 'APR', title: 'Lower Body Power', subtitle: 'Target: Posterior Chain Dominance' },
    ]
  },
  {
    id: 2,
    firstName: 'Sarah',
    lastName:  'Chen',
    email:     's.chen.fit@gmail.com',
    phone:     '+44 7700 900002',
    status:    'onboarding',
    tier:      'Kinetic Lifestyle',
    program:   'Online Coaching',
    joined:    '2024-03-01',
    phase:     'Foundation',
    progress:  15,
    goal:      'Fat Loss',
    weight:    68,
    targetWeight: 62,
    strengthIndex: 45,
    volumeConsistency: 60,
    nutritionCompliance: 55,
    personalBest: { lift: 'Squat', weight: 80 },
    strengthGain: '+5%',
    notes: 'New client, still calibrating. Nutrition logging needs improvement.',
    weightHistory: [70, 69.5, 69, 68.5, 68.5, 68.2, 68, 68, 67.8, 68, 67.5, 68],
    recentActivity: [
      { type: 'workout', title: 'Full Body Foundation A', time: 'Today at 07:15', duration: '45 mins', status: 'completed' },
      { type: 'nutrition', title: 'Nutrition Log Updated', time: '5 hours ago', calories: '1800 kcal', status: '' },
    ],
    upcomingSchedule: [
      { date: '13', month: 'APR', title: 'Intro Call + Assessment', subtitle: 'Video call — programme calibration' },
      { date: '15', month: 'APR', title: 'Full Body Foundation B', subtitle: 'Target: Movement Patterns' },
    ]
  },
  {
    id: 3,
    firstName: 'Jameson',
    lastName:  'Vane',
    email:     'vane.performance@web.io',
    phone:     '+44 7700 900003',
    status:    'active',
    tier:      'Ultimate Cut',
    program:   '1-on-1 Training',
    joined:    '2023-09-10',
    phase:     'Cutting',
    progress:  92,
    goal:      'Fat Loss / Aesthetics',
    weight:    82,
    targetWeight: 78,
    strengthIndex: 91,
    volumeConsistency: 97,
    nutritionCompliance: 88,
    personalBest: { lift: 'Bench Press', weight: 140 },
    strengthGain: '+18%',
    notes: 'Elite performer. Near end of cut phase. Transition to maintenance in ~3 weeks.',
    weightHistory: [90, 89, 88, 87, 86, 85.5, 85, 84.5, 84, 83, 82.5, 82],
    recentActivity: [
      { type: 'workout', title: 'Upper Body Push A', time: 'Yesterday at 17:45', duration: '65 mins', status: 'completed' },
      { type: 'nutrition', title: 'Nutrition Log Updated', time: '2 hours ago', calories: '2850 kcal', status: '' },
    ],
    upcomingSchedule: [
      { date: '14', month: 'APR', title: 'Lower Body Power', subtitle: 'Target: Posterior Chain Dominance' },
      { date: '16', month: 'APR', title: 'Active Recovery / Mobility', subtitle: 'Low intensity steady state + Foam Rolling' },
    ]
  },
  {
    id: 4,
    firstName: 'Elena',
    lastName:  'Petrov',
    email:     'petrov_e_recover@mail.ru',
    phone:     '+44 7700 900004',
    status:    'paused',
    tier:      'Recovery Elite',
    program:   'Online Coaching',
    joined:    '2023-06-20',
    phase:     'Rehabilitation',
    progress:  44,
    goal:      'Post-Injury Recovery',
    weight:    65,
    targetWeight: 65,
    strengthIndex: 52,
    volumeConsistency: 48,
    nutritionCompliance: 72,
    personalBest: { lift: 'Romanian Deadlift', weight: 70 },
    strengthGain: '+8%',
    notes: 'On pause due to travel. Resume April 20th. Lower back rehab protocol ongoing.',
    weightHistory: [65, 65.5, 65.2, 65, 64.8, 65, 65.2, 65.5, 65, 64.8, 65, 65],
    recentActivity: [
      { type: 'workout', title: 'Rehab Protocol A', time: '2 weeks ago', duration: '35 mins', status: 'completed' },
    ],
    upcomingSchedule: [
      { date: '20', month: 'APR', title: 'Programme Resume', subtitle: 'First session back — lower intensity' },
    ]
  },
  {
    id: 5,
    firstName: 'Tyler',
    lastName:  'Nash',
    email:     'tyler.nash@gmail.com',
    phone:     '+44 7700 900005',
    status:    'active',
    tier:      'Elite Performance',
    program:   '1-on-1 Training',
    joined:    '2024-02-01',
    phase:     'Strength Block',
    progress:  60,
    goal:      'Athletic Performance',
    weight:    88,
    targetWeight: 90,
    strengthIndex: 78,
    volumeConsistency: 85,
    nutritionCompliance: 76,
    personalBest: { lift: 'Squat', weight: 200 },
    strengthGain: '+14%',
    notes: 'Former rugby player. Excellent base strength. Focus on hypertrophy accessory work.',
    weightHistory: [86, 86.5, 87, 87, 87.5, 88, 88, 88.5, 88, 88, 88.5, 88],
    recentActivity: [
      { type: 'workout', title: 'Lower Body Strength', time: 'Today at 06:00', duration: '75 mins', status: 'completed' },
      { type: 'nutrition', title: 'Nutrition Log Updated', time: '1 hour ago', calories: '3800 kcal', status: '' },
    ],
    upcomingSchedule: [
      { date: '13', month: 'APR', title: 'Upper Body Push Power', subtitle: 'Target: Chest & Shoulder Strength' },
      { date: '15', month: 'APR', title: 'Olympic Lifting Skill', subtitle: 'Power Clean technique refinement' },
    ]
  },
  {
    id: 6,
    firstName: 'Priya',
    lastName:  'Sharma',
    email:     'p.sharma.fit@outlook.com',
    phone:     '+44 7700 900006',
    status:    'active',
    tier:      'Kinetic Lifestyle',
    program:   'Online Coaching',
    joined:    '2024-01-28',
    phase:     'Recomposition',
    progress:  68,
    goal:      'Body Recomposition',
    weight:    58,
    targetWeight: 57,
    strengthIndex: 70,
    volumeConsistency: 78,
    nutritionCompliance: 85,
    personalBest: { lift: 'Hip Thrust', weight: 120 },
    strengthGain: '+16%',
    notes: 'Excellent nutrition compliance. Strength progressing well.',
    weightHistory: [60, 59.5, 59, 59, 58.5, 58.5, 58, 58, 58, 57.5, 58, 58],
    recentActivity: [
      { type: 'workout', title: 'Glute & Hamstring Day', time: 'Yesterday at 18:00', duration: '55 mins', status: 'completed' },
    ],
    upcomingSchedule: [
      { date: '14', month: 'APR', title: 'Upper Body Hypertrophy', subtitle: 'Target: Shoulder & Back Volume' },
      { date: '17', month: 'APR', title: 'Lower Body Recomp', subtitle: 'Quad dominant + glute finishers' },
    ]
  }
];

/* Persist to localStorage */
function saveClients() {
  localStorage.setItem('lhpt_clients', JSON.stringify(CLIENTS));
}
function loadClients() {
  const stored = localStorage.getItem('lhpt_clients');
  if (stored) {
    const parsed = JSON.parse(stored);
    CLIENTS.length = 0;
    parsed.forEach(c => CLIENTS.push(c));
  } else {
    saveClients();
  }
}
loadClients();

/* === HELPERS === */
function getClient(id) {
  return CLIENTS.find(c => c.id === id);
}
function getClientById(id) {
  const idNum = parseInt(id);
  return CLIENTS.find(c => c.id === idNum);
}
function getInitials(c) {
  return (c.firstName[0] + c.lastName[0]).toUpperCase();
}
function statusLabel(s) {
  return { active: 'Active', onboarding: 'Onboarding', paused: 'Paused' }[s] || s;
}
function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/* === CURRENT CLIENT (profile page) === */
function getCurrentClientId() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  return id ? parseInt(id) : CLIENTS[0].id;
}

/* === NAVIGATE TO PROFILE === */
function goToProfile(id) {
  window.location.href = `profile.html?id=${id}`;
}

/* === KPI CALCULATIONS === */
function getKPIs() {
  const total   = CLIENTS.length;
  const active  = CLIENTS.filter(c => c.status === 'active').length;
  // Simulated revenue
  const revenue = CLIENTS.filter(c => c.status === 'active').reduce((sum, c) => {
    return sum + (c.program === '1-on-1 Training' ? 850 : c.program === 'Online Coaching' ? 350 : 180);
  }, 0);
  return { total, active, revenue };
}

/* === CALENDAR EVENTS === */
function generateCalendarEvents() {
  const events = [];
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  const sessionTemplates = [
    { clientId: 1, title: 'Marcus Thorne — Upper Body Push', type: 'elite', hour: 7, duration: 1 },
    { clientId: 3, title: 'Jameson Vane — Lower Body Power', type: 'elite', hour: 9, duration: 1 },
    { clientId: 5, title: 'Tyler Nash — Strength Block', type: 'elite', hour: 6, duration: 1.25 },
    { clientId: 2, title: 'Sarah Chen — Foundation', type: 'online', hour: 11, duration: 0.75 },
    { clientId: 6, title: 'Priya Sharma — Recomp', type: 'online', hour: 18, duration: 0.75 },
    { clientId: 1, title: 'Marcus Thorne — Active Recovery', type: 'elite', hour: 8, duration: 1 },
    { clientId: 3, title: 'Jameson Vane — Upper Body Pull', type: 'elite', hour: 7, duration: 1 },
    { clientId: 5, title: 'Tyler Nash — Olympic Lifting', type: 'elite', hour: 6, duration: 1 },
    { clientId: 2, title: 'Group Session Alpha', type: 'group', hour: 10, duration: 1 },
    { clientId: 6, title: 'Group Session Alpha', type: 'group', hour: 10, duration: 1 },
    { clientId: 4, title: 'Elena Petrov — Resume', type: 'online', hour: 14, duration: 0.75 },
  ];

  // Spread events across next 4 weeks
  for (let week = -1; week <= 3; week++) {
    const days = [1, 2, 3, 4, 5, 6]; // Mon-Sat
    sessionTemplates.forEach((t, i) => {
      const day = days[i % days.length];
      const d = new Date(year, month, now.getDate() + (week * 7) + (day - now.getDay()));
      if (d.getMonth() !== month && d.getMonth() !== month + 1) return;
      const start = new Date(d);
      start.setHours(t.hour, 0, 0, 0);
      const end = new Date(start);
      end.setMinutes(end.getMinutes() + t.duration * 60);
      events.push({
        id: `evt-${week}-${i}`,
        title: t.title,
        start: start.toISOString(),
        end:   end.toISOString(),
        className: `event-${t.type}`,
        extendedProps: { clientId: t.clientId, type: t.type }
      });
    });
  }
  return events;
}

window.LHPT = {
  CLIENTS, getClient, getClientById, getInitials,
  statusLabel, formatDate, getCurrentClientId,
  goToProfile, getKPIs, generateCalendarEvents, saveClients
};
