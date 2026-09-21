/**
 * Submission Controller
 * Implements granular actions and declarative scope evaluation:
 * - Scopes: all, assigned, jury_panel, department
 * - Permissions: submission.view, submission.create, submission.edit,
 *                submission.update_status, submission.reject, submission.delete
 */

// Demo submissions enriched with scope evaluation attributes
let submissionData = [
  {
    id: 1,
    title: 'Documentary Film - The Journey',
    category: 'Documentary',
    category_id: 1,
    department_id: 1,
    assigned_reviewers: [2], // assigned to reviewer (user id 2)
    status: 'Under Review',
    submittedBy: 'John Doe',
    submittedAt: '2026-02-15'
  },
  {
    id: 2,
    title: 'Short Film - Sunrise',
    category: 'Short Film',
    category_id: 2,
    department_id: 1,
    assigned_reviewers: [2],
    status: 'Accepted',
    submittedBy: 'Jane Smith',
    submittedAt: '2026-02-16'
  },
  {
    id: 3,
    title: 'Animation - Dream World',
    category: 'Animation',
    category_id: 3,
    department_id: 2,
    assigned_reviewers: [99], // not assigned to current reviewer
    status: 'Pending',
    submittedBy: 'Alice Brown',
    submittedAt: '2026-02-17'
  },
  {
    id: 4,
    title: 'Feature Film - The Horizon',
    category: 'Feature Film',
    category_id: 1,
    department_id: 2,
    assigned_reviewers: [99],
    status: 'Rejected',
    submittedBy: 'Bob Wilson',
    submittedAt: '2026-02-18'
  },
];

/**
 * Apply scope filtering (in Phase 1 without scope_key, all data is returned).
 */
function applyScopeFilter(data, user, scope) {
  return data;
}

/**
 * GET /api/submissions — requires submission.view
 */
async function list(req, res) {
  const filtered = applyScopeFilter(submissionData, req.user, req.permissionScope);
  res.json({
    data: filtered,
    total: filtered.length,
    activeScope: 'all',
    appliedRule: null,
  });
}

/**
 * GET /api/submissions/:id — requires submission.view
 */
async function getById(req, res) {
  const id = parseInt(req.params.id, 10);
  const item = submissionData.find(s => s.id === id);
  if (!item) return res.status(404).json({ error: 'Submission not found.' });
  res.json(item);
}

/**
 * POST /api/submissions — requires submission.create
 */
async function create(req, res) {
  const { title, category, department_id = 1 } = req.body;
  if (!title) return res.status(400).json({ error: 'Title is required.' });

  const newItem = {
    id: Date.now(),
    title,
    category: category || 'General',
    category_id: 1,
    department_id,
    assigned_reviewers: [req.user.id],
    status: 'Pending',
    submittedBy: req.user.name || 'Anonymous',
    submittedAt: new Date().toISOString().split('T')[0],
  };

  submissionData.unshift(newItem);
  res.status(201).json({ message: 'Submission created successfully.', data: newItem });
}

/**
 * PUT /api/submissions/:id — requires submission.edit
 */
async function update(req, res) {
  const id = parseInt(req.params.id, 10);
  const index = submissionData.findIndex(s => s.id === id);
  if (index === -1) return res.status(404).json({ error: 'Submission not found.' });

  const { title, category, status } = req.body;
  if (title) submissionData[index].title = title;
  if (category) submissionData[index].category = category;
  if (status) submissionData[index].status = status;

  res.json({ message: 'Submission updated.', data: submissionData[index] });
}

/**
 * PUT /api/submissions/:id/status — requires submission.update_status
 */
async function updateStatus(req, res) {
  const id = parseInt(req.params.id, 10);
  const index = submissionData.findIndex(s => s.id === id);
  if (index === -1) return res.status(404).json({ error: 'Submission not found.' });

  const { status } = req.body;
  if (!status) return res.status(400).json({ error: 'Status is required.' });

  submissionData[index].status = status;
  res.json({ message: `Status updated to ${status}.`, data: submissionData[index] });
}

/**
 * POST /api/submissions/:id/reject — requires submission.reject
 */
async function reject(req, res) {
  const id = parseInt(req.params.id, 10);
  const index = submissionData.findIndex(s => s.id === id);
  if (index === -1) return res.status(404).json({ error: 'Submission not found.' });

  submissionData[index].status = 'Rejected';
  res.json({ message: 'Submission marked as rejected.', data: submissionData[index] });
}

/**
 * DELETE /api/submissions/:id — requires submission.delete
 */
async function remove(req, res) {
  const id = parseInt(req.params.id, 10);
  const index = submissionData.findIndex(s => s.id === id);
  if (index === -1) return res.status(404).json({ error: 'Submission not found.' });

  submissionData.splice(index, 1);
  res.json({ message: 'Submission deleted.' });
}

module.exports = { list, getById, create, update, updateStatus, reject, remove };
