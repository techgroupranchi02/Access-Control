/**
 * Jury Controller
 * Demo CRUD for the Jury core page.
 * Demonstrates granular permission control + feature toggle.
 */

// In-memory demo data
let juryData = [
  { id: 1, name: 'Dr. Robert Lang', expertise: 'Film Criticism', rating: 4.8, assignedCategory: 'Documentary', status: 'Active' },
  { id: 2, name: 'Prof. Maria Santos', expertise: 'Cinematography', rating: 4.9, assignedCategory: 'Feature Film', status: 'Active' },
  { id: 3, name: 'Alex Thompson', expertise: 'Animation', rating: 4.7, assignedCategory: 'Animation', status: 'Inactive' },
  { id: 4, name: 'Lisa Park', expertise: 'Short Films', rating: 4.6, assignedCategory: 'Short Film', status: 'Active' },
];

/**
 * GET /api/jury — requires jury:read (and jury feature must be enabled)
 */
async function list(req, res) {
  res.json(juryData);
}

/**
 * GET /api/jury/:id — requires jury:read
 */
async function getById(req, res) {
  const id = parseInt(req.params.id, 10);
  const member = juryData.find(j => j.id === id);
  if (!member) return res.status(404).json({ error: 'Jury member not found.' });
  res.json(member);
}

/**
 * PUT /api/jury/:id — requires jury:update
 */
async function update(req, res) {
  const id = parseInt(req.params.id, 10);
  const index = juryData.findIndex(j => j.id === id);
  if (index === -1) return res.status(404).json({ error: 'Jury member not found.' });

  const { name, expertise, rating, assignedCategory, status } = req.body;
  if (name) juryData[index].name = name;
  if (expertise) juryData[index].expertise = expertise;
  if (rating) juryData[index].rating = rating;
  if (assignedCategory) juryData[index].assignedCategory = assignedCategory;
  if (status) juryData[index].status = status;

  res.json({ message: 'Jury member updated.', data: juryData[index] });
}

/**
 * DELETE /api/jury/:id — requires jury:delete
 */
async function remove(req, res) {
  const id = parseInt(req.params.id, 10);
  const index = juryData.findIndex(j => j.id === id);
  if (index === -1) return res.status(404).json({ error: 'Jury member not found.' });

  juryData.splice(index, 1);
  res.json({ message: 'Jury member removed.' });
}

module.exports = { list, getById, update, remove };
