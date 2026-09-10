/**
 * CustomA Plugin — Controller
 * Self-contained plugin page logic.
 * This file has ZERO imports from core business logic.
 * It only interacts with the core via middleware (auth, permissions).
 */

// In-memory demo data for CustomA
let customAData = [
  { id: 1, title: 'Custom Report Alpha', description: 'Quarterly analysis report for stakeholders', priority: 'High', status: 'Active', createdAt: '2024-02-01' },
  { id: 2, title: 'Integration Module B', description: 'Third-party API integration module', priority: 'Medium', status: 'Draft', createdAt: '2024-02-05' },
  { id: 3, title: 'Analytics Dashboard', description: 'Real-time analytics visualization dashboard', priority: 'High', status: 'Active', createdAt: '2024-02-10' },
  { id: 4, title: 'Workflow Template C', description: 'Automated workflow template for processing', priority: 'Low', status: 'Archived', createdAt: '2024-02-15' },
];

/**
 * GET /api/plugins/customA — requires customA:read
 */
async function list(req, res) {
  res.json(customAData);
}

/**
 * GET /api/plugins/customA/:id — requires customA:read
 */
async function getById(req, res) {
  const id = parseInt(req.params.id, 10);
  const item = customAData.find(d => d.id === id);
  if (!item) return res.status(404).json({ error: 'Custom A item not found.' });
  res.json(item);
}

/**
 * PUT /api/plugins/customA/:id — requires customA:update
 */
async function update(req, res) {
  const id = parseInt(req.params.id, 10);
  const index = customAData.findIndex(d => d.id === id);
  if (index === -1) return res.status(404).json({ error: 'Custom A item not found.' });

  const { title, description, priority, status } = req.body;
  if (title) customAData[index].title = title;
  if (description) customAData[index].description = description;
  if (priority) customAData[index].priority = priority;
  if (status) customAData[index].status = status;

  res.json({ message: 'Custom A item updated.', data: customAData[index] });
}

/**
 * DELETE /api/plugins/customA/:id — requires customA:delete
 */
async function remove(req, res) {
  const id = parseInt(req.params.id, 10);
  const index = customAData.findIndex(d => d.id === id);
  if (index === -1) return res.status(404).json({ error: 'Custom A item not found.' });

  customAData.splice(index, 1);
  res.json({ message: 'Custom A item deleted.' });
}

module.exports = { list, getById, update, remove };
