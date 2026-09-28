/**
 * Seeder 002: Canonical Freecomers Platform Dataset
 *
 * Populates real data matching https://freecomers.pages.dev/
 * - Festival: Indie Film Festival Bangalore (Edition 4 · 2026)
 * - 16 Team Members across Admin, Judge, Volunteer
 * - 23 Submissions with real statuses, categories, runtimes, flags
 * - 14 Tasks (3 unassigned, 2 assigned to Volunteer Amit Sharma)
 * - 4-Day Schedule with Day 1 conflict ("The Long Walk" at 17:30 vs Deepa Rao arrival at 19:00)
 * - VIP Guests (Deepa Rao assigned to Amit Sharma)
 * - Chat Channels (Judges, Tasks) and message fixtures
 * - Sponsors, Deliverables, Payout Milestones
 */

const { query } = require('../src/config/database');
const bcrypt = require('bcrypt');

async function seed() {
  console.log('[Seeder 002] Seeding canonical Freecomers dataset...');
  await query('SET FOREIGN_KEY_CHECKS = 0;');

  const defaultHash = await bcrypt.hash('Password@123', 10);

  // 1. Event
  await query(`
    INSERT INTO events (event_id, user_id, name, slug, edition, description, event_type, saas_enabled)
    VALUES (1, 1, 'Indie Film Festival Bangalore', 'indie-film-festival-bangalore', 'Edition 4 · 2026', 'Bangalore\\'s premier independent film showcase celebrating emerging cinematic voices.', 'film_festival', 1)
    ON DUPLICATE KEY UPDATE name=VALUES(name), edition=VALUES(edition), description=VALUES(description);
  `);

  // 2. Groups (Canonical 3 active groups)
  const groups = [
    { id: 1, group_key: 'admin', label: 'Admin', description: 'Festival Director & Control Tower governance', is_system: true },
    { id: 2, group_key: 'judge', label: 'Judge', description: 'Screening reviews, 5-criteria scorecards and jury ballots', is_system: true },
    { id: 3, group_key: 'volunteer', label: 'Volunteer', description: 'Shift operations, task execution and check-in desk', is_system: true }
  ];

  for (const g of groups) {
    await query(`
      INSERT INTO \`groups\` (id, group_key, label, description, is_system)
      VALUES (?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE label=VALUES(label), description=VALUES(description);
    `, [g.id, g.group_key, g.label, g.description, g.is_system]);
  }

  // 3. 16 Team Members
  const members = [
    { id: 1, name: 'Arun Kapoor', email: 'arun@freecomers.test', role: 'admin', dept: 'Management' },
    { id: 2, name: 'System Administrator', email: 'admin@freecomers.test', role: 'admin', dept: 'Tech' },
    { id: 3, name: 'Deepak Rao', email: 'deepak@freecomers.test', role: 'admin', dept: 'Venue' },
    { id: 4, name: 'Amit Sharma', email: 'amit@freecomers.test', role: 'volunteer', dept: 'Registration' },
    { id: 5, name: 'Divya Shah', email: 'divya@freecomers.test', role: 'volunteer', dept: 'Venue' },
    { id: 6, name: 'Sunita Mehta', email: 'sunita@freecomers.test', role: 'volunteer', dept: 'Hospitality' },
    { id: 7, name: 'Aryan Gupta', email: 'aryan@freecomers.test', role: 'admin', dept: 'Tech' },
    { id: 8, name: 'Ananya Sen', email: 'ananya@freecomers.test', role: 'judge', dept: 'Jury' },
    { id: 9, name: 'Vikram Nair', email: 'vikram@freecomers.test', role: 'judge', dept: 'Jury' },
    { id: 10, name: 'Rohan Verma', email: 'rohan@freecomers.test', role: 'volunteer', dept: 'Guest Escort' },
    { id: 11, name: 'Meera Joshi', email: 'meera@freecomers.test', role: 'volunteer', dept: 'Registration' },
    { id: 12, name: 'Kavita Reddy', email: 'kavita@freecomers.test', role: 'judge', dept: 'Jury' },
    { id: 13, name: 'Rahul Desai', email: 'rahul@freecomers.test', role: 'volunteer', dept: 'Tech' },
    { id: 14, name: 'Pooja Hegde', email: 'pooja@freecomers.test', role: 'volunteer', dept: 'Hospitality' },
    { id: 15, name: 'Siddharth Rao', email: 'siddharth@freecomers.test', role: 'volunteer', dept: 'Venue' },
    { id: 16, name: 'Neha Kapoor', email: 'neha@freecomers.test', role: 'volunteer', dept: 'Guest Escort' }
  ];

  for (const m of members) {
    await query(`
      INSERT INTO users (id, name, email, password_hash)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE name=VALUES(name);
    `, [m.id, m.name, m.email, defaultHash]);

    const groupId = m.role === 'admin' ? 1 : m.role === 'judge' ? 2 : 3;
    await query(`
      INSERT INTO user_event_groups (user_id, event_id, group_id)
      VALUES (?, 1, ?)
      ON DUPLICATE KEY UPDATE group_id=VALUES(group_id);
    `, [m.id, groupId]);
  }

  // 4. Submission Flags
  const flags = [
    { id: 'flag-001', label: 'Audio Issue', color: '#e05252' },
    { id: 'flag-002', label: 'Copyright Check', color: '#f59e0b' },
    { id: 'flag-003', label: 'High Priority', color: '#3b82f6' }
  ];
  for (const f of flags) {
    await query(`
      INSERT INTO submission_flags (id, event_id, label, color)
      VALUES (?, 1, ?, ?)
      ON DUPLICATE KEY UPDATE label=VALUES(label), color=VALUES(color);
    `, [f.id, f.label, f.color]);
  }

  // 5. 23 Submissions
  const films = [
    { id: 101, title: 'Blue Hour', director: 'Tanvi Shah', category: 'Short Film', runtime: 16, country: 'India', status: 'Official Selection', flag_id: null, rating: 4.60 },
    { id: 102, title: 'Broken Bridges', director: 'Priya Sharma', category: 'Short Film', runtime: 14, country: 'India', status: 'Submitted', flag_id: 'flag-001', rating: null },
    { id: 103, title: 'Chasing Shadows', director: 'Rahul Verma', category: 'Documentary', runtime: 28, country: 'India', status: 'Official Selection', flag_id: null, rating: 4.20 },
    { id: 104, title: 'Distant Lights', director: 'Sanjay Patel', category: 'Short Film', runtime: 19, country: 'India', status: 'Submitted', flag_id: null, rating: null },
    { id: 105, title: 'The Long Walk', director: 'Deepa Rao', category: 'Short Film', runtime: 22, country: 'India', status: 'Official Selection', flag_id: null, rating: 4.70 },
    { id: 106, title: 'Echoes of Silence', director: 'Neha Kapoor', category: 'Student Film', runtime: 12, country: 'India', status: 'Official Selection', flag_id: null, rating: 4.40 },
    { id: 107, title: 'Fading Footsteps', director: 'Amit Joshi', category: 'Short Film', runtime: 15, country: 'India', status: 'Submitted', flag_id: null, rating: null },
    { id: 108, title: 'Golden Leaves', director: 'Sunita Rao', category: 'Animation', runtime: 8, country: 'India', status: 'Official Selection', flag_id: null, rating: 4.80 },
    { id: 109, title: 'Hidden Rivers', director: 'Karan Malhotra', category: 'Documentary', runtime: 35, country: 'India', status: 'Official Selection', flag_id: null, rating: 4.50 },
    { id: 110, title: 'In the Mist', director: 'Vikram Sen', category: 'Short Film', runtime: 17, country: 'India', status: 'Submitted', flag_id: null, rating: null },
    { id: 111, title: 'Journey Home', director: 'Ananya Gupta', category: 'Short Film', runtime: 20, country: 'India', status: 'Official Selection', flag_id: null, rating: 4.30 },
    { id: 112, title: 'Kaleidoscope', director: 'Rohit Mehta', category: 'Animation', runtime: 10, country: 'India', status: 'Official Selection', flag_id: null, rating: 4.60 },
    { id: 113, title: 'Lost Melody', director: 'Divya Nair', category: 'Music Video', runtime: 5, country: 'India', status: 'Official Selection', flag_id: null, rating: 4.10 },
    { id: 114, title: 'Midnight Train', director: 'Suresh Kumar', category: 'Short Film', runtime: 18, country: 'India', status: 'Rejected', flag_id: null, rating: null, reason: 'Exceeds runtime guidelines for short fiction category.' },
    { id: 115, title: 'Northern Winds', director: 'Arvind Swamy', category: 'Documentary', runtime: 42, country: 'India', status: 'Submitted', flag_id: null, rating: null },
    { id: 116, title: 'Old Alleyways', director: 'Maya Shankar', category: 'Short Film', runtime: 13, country: 'India', status: 'Submitted', flag_id: null, rating: null },
    { id: 117, title: 'Paper Boats', director: 'Arjun Das', category: 'Student Film', runtime: 11, country: 'India', status: 'Submitted', flag_id: null, rating: null },
    { id: 118, title: 'Quiet Waters', director: 'Shreya Roy', category: 'Short Film', runtime: 15, country: 'India', status: 'Submitted', flag_id: null, rating: null },
    { id: 119, title: 'Red Earth', director: 'Vijay Sethupathi', category: 'Feature Film', runtime: 95, country: 'India', status: 'Submitted', flag_id: null, rating: null },
    { id: 120, title: 'Silent Echo', director: 'Meenakshi Sundaram', category: 'Short Film', runtime: 14, country: 'India', status: 'Submitted', flag_id: null, rating: null },
    { id: 121, title: 'The Crossing', director: 'Karthik Subbaraj', category: 'Short Film', runtime: 21, country: 'India', status: 'Submitted', flag_id: null, rating: null },
    { id: 122, title: 'Under the Banyan', director: 'Gautham Menon', category: 'Short Film', runtime: 16, country: 'India', status: 'Submitted', flag_id: null, rating: null },
    { id: 123, title: 'Voices in the Wind', director: 'Mani Ratnam', category: 'Documentary', runtime: 52, country: 'India', status: 'Submitted', flag_id: null, rating: null }
  ];

  for (const film of films) {
    await query(`
      INSERT INTO submissions (id, event_id, title, director, category, runtime, country, status, flag_id, overall_average_rating, email, synopsis, rejection_reason, rejected_at)
      VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE title=VALUES(title), status=VALUES(status), flag_id=VALUES(flag_id), overall_average_rating=VALUES(overall_average_rating);
    `, [
      film.id, film.title, film.director, film.category, film.runtime, film.country,
      film.status, film.flag_id, film.rating, `${film.director.toLowerCase().replace(/\s+/g, '.')}@filmmaker.test`,
      `Synopsis for ${film.title}: A gripping independent film by ${film.director}.`,
      film.reason || null,
      film.status === 'Rejected' ? new Date() : null
    ]);
  }

  // 6. Screening Assignments & Reviews for Judge Ananya Sen (User 8)
  await query(`
    INSERT INTO screening_assignments (id, event_id, film_id, round_number, judge_user_id, status)
    VALUES 
      (1, 1, 102, 1, 8, 'in_progress'),
      (2, 1, 104, 1, 8, 'assigned'),
      (3, 1, 105, 1, 8, 'completed'),
      (4, 1, 101, 1, 9, 'completed')
    ON DUPLICATE KEY UPDATE status=VALUES(status);
  `);

  await query(`
    INSERT INTO screening_reviews (id, assignment_id, event_id, film_id, judge_user_id, round_number, criteria_scores, overall_rating, notes)
    VALUES (1, 3, 1, 105, 8, 1, '{"directing": 5, "screenplay": 5, "cinematography": 4, "acting": 5, "sound": 4}', 4.60, 'Stunning emotional arc and masterful pacing throughout.')
    ON DUPLICATE KEY UPDATE overall_rating=VALUES(overall_rating);
  `);

  // 7. Pipeline State
  await query(`
    INSERT INTO pipeline_states (id, event_id, current_stage, voting_open)
    VALUES (1, 1, 1, FALSE)
    ON DUPLICATE KEY UPDATE current_stage=VALUES(current_stage), voting_open=VALUES(voting_open);
  `);

  // 8. Award Categories
  const categories = [
    { id: 1, name: 'Best Short Film', order_index: 1 },
    { id: 2, name: 'Best Director', order_index: 2 },
    { id: 3, name: 'Best Cinematography', order_index: 3 },
    { id: 4, name: 'Best Screenplay', order_index: 4 },
    { id: 5, name: 'Audience Choice Award', order_index: 5 }
  ];
  for (const c of categories) {
    await query(`
      INSERT INTO award_categories (id, event_id, name, order_index)
      VALUES (?, 1, ?, ?)
      ON DUPLICATE KEY UPDATE name=VALUES(name);
    `, [c.id, c.name, c.order_index]);
  }

  // 9. 14 Tasks (3 unassigned, exactly 2 assigned to Amit Sharma)
  const taskRows = [
    { id: 1, title: 'Registration Desk Setup', dept: 'Registration', priority: 'urgent', status: 'To Do', userIds: [4] },
    { id: 2, title: 'Badge Reprint Queue Monitoring', dept: 'Registration', priority: 'medium', status: 'Done', userIds: [4] },
    { id: 3, title: 'Main Auditorium Projector Calibration', dept: 'Tech', priority: 'urgent', status: 'In Progress', userIds: [13] },
    { id: 4, title: 'Audio Level Testing - Indie Room', dept: 'Tech', priority: 'high', status: 'To Do', userIds: [13] },
    { id: 5, title: 'VIP Airport Pickups Coordination', dept: 'Guest Escort', priority: 'high', status: 'In Progress', userIds: [10] },
    { id: 6, title: 'Director Deepa Rao Hotel Check-In', dept: 'Hospitality', priority: 'medium', status: 'To Do', userIds: [6] },
    { id: 7, title: 'Outdoor Screen Weather Check', dept: 'Venue', priority: 'low', status: 'To Do', userIds: [5] },
    { id: 8, title: 'Opening Ceremony Seating Plan', dept: 'Venue', priority: 'high', status: 'Done', userIds: [15] },
    { id: 9, title: 'Sponsor Step-and-Repeat Banner Setup', dept: 'Hospitality', priority: 'medium', status: 'Done', userIds: [14] },
    { id: 10, title: 'Welcome Kit Bag Stuffing', dept: 'Registration', priority: 'medium', status: 'Done', userIds: [11] },
    { id: 11, title: 'Jury Room Catering Refreshment', dept: 'Hospitality', priority: 'low', status: 'To Do', userIds: [] },
    { id: 12, title: 'Auditorium Mic Batteries Replacement', dept: 'Tech', priority: 'high', status: 'To Do', userIds: [] },
    { id: 13, title: 'Emergency Exit Lighting Inspection', dept: 'Venue', priority: 'urgent', status: 'To Do', userIds: [] },
    { id: 14, title: 'Closing Night Gala Entrance Desk', dept: 'Guest Escort', priority: 'medium', status: 'To Do', userIds: [16] }
  ];

  await query('DELETE FROM task_assignees;');
  for (const t of taskRows) {
    await query(`
      INSERT INTO tasks (id, event_id, title, department, priority, due_date, status, created_by_user_id)
      VALUES (?, 1, ?, ?, ?, '2026-06-05 12:00:00', ?, 1)
      ON DUPLICATE KEY UPDATE title=VALUES(title), status=VALUES(status);
    `, [t.id, t.title, t.dept, t.priority, t.status]);

    for (const uid of t.userIds) {
      await query(`
        INSERT INTO task_assignees (task_id, user_id)
        VALUES (?, ?)
        ON DUPLICATE KEY UPDATE user_id=VALUES(user_id);
      `, [t.id, uid]);
    }
  }

  // 10. Venues & Schedule (with Day 1 Conflict)
  await query(`
    INSERT INTO venues (id, event_id, name, capacity)
    VALUES 
      (1, 1, 'Main Auditorium', 450),
      (2, 1, 'Indie Room', 120),
      (3, 1, 'Outdoor Screen', 300)
    ON DUPLICATE KEY UPDATE name=VALUES(name);
  `);

  await query('DELETE FROM venue_screening_slots;');
  await query(`
    INSERT INTO venue_screening_slots (id, event_id, venue_name, day_index, start_time, end_time, film_id)
    VALUES
      (1, 1, 'Main Auditorium', 0, '10:00:00', '12:00:00', 101),
      (2, 1, 'Main Auditorium', 0, '17:30:00', '19:00:00', 105),
      (3, 1, 'Indie Room', 0, '14:00:00', '15:30:00', 103),
      (4, 1, 'Outdoor Screen', 0, '19:30:00', '21:00:00', 108),
      (5, 1, 'Main Auditorium', 1, '11:00:00', '13:00:00', 106),
      (6, 1, 'Indie Room', 1, '15:00:00', '17:00:00', 109);
  `);

  // 11. VIP Guests (Deepa Rao arriving at 19:00, assigned to Amit Sharma)
  const guests = [
    { id: 12, name: 'Deepa Rao', role: 'Director - "The Long Walk"', rsvp: 'Confirmed', hotel: 'Grand Hyatt - Room 402', flight: 'AI 302 Arrival 19:00', volId: 4 },
    { id: 13, name: 'Tanvi Shah', role: 'Director - "Blue Hour"', rsvp: 'Arrived', hotel: 'The Leela - Room 108', flight: '6E 445 Arrival 09:30', volId: 4 },
    { id: 14, name: 'Rahul Verma', role: 'Director - "Chasing Shadows"', rsvp: 'Confirmed', hotel: 'Taj West End', flight: 'UK 821 Arrival 14:15', volId: 10 },
    { id: 15, name: 'Sunita Rao', role: 'Director - "Golden Leaves"', rsvp: 'Invite Sent', hotel: 'Grand Hyatt', flight: 'TBD', volId: 6 }
  ];

  for (const g of guests) {
    await query(`
      INSERT INTO guests (id, event_id, name, role, rsvp_status, hotel_details, flight_details, assigned_volunteer_id, badge_issued)
      VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE rsvp_status=VALUES(rsvp_status);
    `, [g.id, g.name, g.role, g.rsvp, g.hotel, g.flight, g.volId, g.rsvp === 'Arrived']);
  }

  // 12. Chat Channels & Messages
  await query(`
    INSERT INTO chat_channels (id, event_id, name, description, is_system_group, visibility_mode, visible_to_roles, created_by_user_id)
    VALUES
      ('grp-judges', 1, 'Judges', 'Private chat for festival judges to discuss submissions and scoring', TRUE, 'roles', '["admin", "judge"]', 1),
      ('grp-tasks', 1, 'Tasks', 'Task-related discussions and coordination', TRUE, 'roles', '["admin", "volunteer"]', 1)
    ON DUPLICATE KEY UPDATE name=VALUES(name);
  `);

  await query('DELETE FROM chat_messages;');
  await query(`
    INSERT INTO chat_messages (id, channel_id, sender_user_id, content)
    VALUES
      ('msg-001', 'grp-tasks', 1, 'Welcome all team members to Indie Film Festival Bangalore 2026!'),
      ('msg-002', 'grp-tasks', 4, 'Registration desk setup is complete. Badge printers ready.'),
      ('msg-003', 'grp-judges', 8, 'Screening reviews for Round 1 have commenced. Cinematography in Short Films is outstanding.');
  `);

  // 13. Sponsors & Deliverables
  await query(`
    INSERT INTO sponsors (id, event_id, name, tier, contract_amount, logo_url)
    VALUES
      (1, 1, 'Netflix Indie Fund', 'Title', 25000.00, '/assets/sponsors/netflix.png'),
      (2, 1, 'Kodak Motion Picture', 'Presenting', 15000.00, '/assets/sponsors/kodak.png'),
      (3, 1, 'Sony CineAlta', 'Partner', 7500.00, '/assets/sponsors/sony.png')
    ON DUPLICATE KEY UPDATE name=VALUES(name);
  `);

  await query('DELETE FROM sponsor_deliverables;');
  await query(`
    INSERT INTO sponsor_deliverables (id, sponsor_id, title, due_date, status)
    VALUES
      (1, 1, 'Main Stage Step-and-Repeat Logo', '2026-06-01', 'Completed'),
      (2, 1, 'Pre-Screening Trailer Reel (30s DCP)', '2026-06-03', 'In Progress'),
      (3, 2, 'Kodak 35mm Student Grant Presentation', '2026-06-06', 'Pending'),
      (4, 3, 'Sony Gear Expo Table Setup', '2026-06-05', 'Pending');
  `);

  // 14. Payout Milestones
  await query(`
    INSERT INTO payout_milestones (id, event_id, title, target_amount, status)
    VALUES
      ('ms-earlybird', 1, 'Earlybird Fee Release', 12500.00, 'Eligible'),
      ('ms-regular', 1, 'Regular Deadline Release', 25000.00, 'Locked'),
      ('ms-final', 1, 'Festival Wrap-Up Balance', 15000.00, 'Locked')
    ON DUPLICATE KEY UPDATE title=VALUES(title), status=VALUES(status);
  `);

  // 15. Departments
  const depts = ['Tech', 'Venue', 'Registration', 'Hospitality', 'Guest Escort', 'Jury', 'Management'];
  for (const d of depts) {
    await query(`
      INSERT INTO festival_departments (event_id, name)
      VALUES (1, ?)
      ON DUPLICATE KEY UPDATE name=VALUES(name);
    `, [d]);
  }

  await query('SET FOREIGN_KEY_CHECKS = 1;');
  console.log('[Seeder 002] ✓ Canonical Freecomers platform data seeded successfully.');
}

module.exports = { seed };

if (require.main === module) {
  seed()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
