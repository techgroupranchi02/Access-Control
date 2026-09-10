/**
 * CustomB Plugin — Controller
 * Self-contained plugin page logic for Custom B.
 * Has ZERO imports from core business logic.
 */

let customBData = [
  { id: 1, title: 'Workshop Session 101', topic: 'Modern Film Production', instructor: 'Elena Rostova', capacity: 45, status: 'Active', scheduleDate: '2026-10-15' },
  { id: 2, title: 'Sound Design Masterclass', topic: 'Dolby Atmos Spatial Audio', instructor: 'Marcus Chen', capacity: 30, status: 'Upcoming', scheduleDate: '2026-10-18' },
  { id: 3, title: 'Cinematography in Low Light', topic: 'Color Science & Anamorphic', instructor: 'Sarah Jenkins', capacity: 25, status: 'Active', scheduleDate: '2026-10-20' },
  { id: 4, title: 'Distribution & Rights Pitch', topic: 'Global Streaming Contracts', instructor: 'David Vance', capacity: 60, status: 'Draft', scheduleDate: '2026-10-25' },
];

async function list(req, res) {
  res.json(customBData);
}

async function getById(req, res) {
  const id = parseInt(req.params.id, 10);
  const item = customBData.find(d => d.id === id);
  if (!item) return res.status(404).json({ error: 'Custom B item not found.' });
  res.json(item);
}

async function update(req, res) {
  const id = parseInt(req.params.id, 10);
  const index = customBData.findIndex(d => d.id === id);
  if (index === -1) return res.status(404).json({ error: 'Custom B item not found.' });

  const { title, topic, instructor, capacity, status } = req.body;
  if (title) customBData[index].title = title;
  if (topic) customBData[index].topic = topic;
  if (instructor) customBData[index].instructor = instructor;
  if (capacity !== undefined) customBData[index].capacity = capacity;
  if (status) customBData[index].status = status;

  res.json({ message: 'Custom B item updated.', data: customBData[index] });
}

async function remove(req, res) {
  const id = parseInt(req.params.id, 10);
  const index = customBData.findIndex(d => d.id === id);
  if (index === -1) return res.status(404).json({ error: 'Custom B item not found.' });

  customBData.splice(index, 1);
  res.json({ message: 'Custom B item deleted.' });
}

module.exports = { list, getById, update, remove };
