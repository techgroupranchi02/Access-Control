/**
 * Modules Controller
 * Festival module settings: which modules (add-ons) a festival has turned on.
 * The demo handlers with made-up data (reviews, calendar, tasks, departments, payments, news, analytics) were
 * removed (API review A4); the real ones live in their own controllers.
 */

const { getEventId } = require('../utils/eventId');
const editionService = require('../services/edition.service');

// ── Settings & Addon Toggling Handlers ────────────────────────────────
async function getSettings(req, res) {
  const editionId = getEventId(req);
  const modules = await editionService.getEditionConfig(editionId);
  res.json({
    editionId,
    modules,
  });
}

async function toggleAddon(req, res) {
  const editionId = getEventId(req);
  const moduleId = parseInt(req.params.moduleId, 10);
  const { isEnabled } = req.body;

  await editionService.toggleModule(editionId, moduleId, isEnabled);
  res.json({ message: 'Module status updated.', moduleId, isEnabled });
}

module.exports = {
  getSettings,
  toggleAddon,
};
