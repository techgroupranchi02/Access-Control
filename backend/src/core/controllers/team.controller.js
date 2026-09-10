/**
 * Team Controller
 * Demo CRUD for the Team core page.
 * Simple page-level access control (no granular sections).
 */

// In-memory demo data
let teamData = [
  { id: 1, name: 'Sarah Johnson', role: 'Festival Director', email: 'sarah@festival.com', department: 'Management' },
  { id: 2, name: 'Mike Chen', role: 'Technical Lead', email: 'mike@festival.com', department: 'Technology' },
  { id: 3, name: 'Emily Davis', role: 'Marketing Head', email: 'emily@festival.com', department: 'Marketing' },
  { id: 4, name: 'James Wilson', role: 'Operations Manager', email: 'james@festival.com', department: 'Operations' },
];

/**
 * GET /api/team — requires team:read
 */
async function list(req, res) {
  res.json(teamData);
}

/**
 * GET /api/team/:id — requires team:read
 */
async function getById(req, res) {
  const id = parseInt(req.params.id, 10);
  const member = teamData.find(t => t.id === id);
  if (!member) return res.status(404).json({ error: 'Team member not found.' });
  res.json(member);
}

/**
 * PUT /api/team/:id — requires team:update
 */
async function update(req, res) {
  const id = parseInt(req.params.id, 10);
  const index = teamData.findIndex(t => t.id === id);
  if (index === -1) return res.status(404).json({ error: 'Team member not found.' });

  const { name, role, email, department } = req.body;
  if (name) teamData[index].name = name;
  if (role) teamData[index].role = role;
  if (email) teamData[index].email = email;
  if (department) teamData[index].department = department;

  res.json({ message: 'Team member updated.', data: teamData[index] });
}

/**
 * DELETE /api/team/:id — requires team:delete
 */
async function remove(req, res) {
  const id = parseInt(req.params.id, 10);
  const index = teamData.findIndex(t => t.id === id);
  if (index === -1) return res.status(404).json({ error: 'Team member not found.' });

  teamData.splice(index, 1);
  res.json({ message: 'Team member removed.' });
}

module.exports = { list, getById, update, remove };
