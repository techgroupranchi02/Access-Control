/**
 * Festival Controller
 * Handles festival listing and configuration endpoints.
 */

const festivalService = require('../services/festival.service');

/**
 * GET /api/festivals
 */
async function list(req, res) {
  try {
    const festivals = await festivalService.getAllFestivals();
    res.json(festivals);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch festivals.' });
  }
}

/**
 * GET /api/festivals/:slug
 */
async function getBySlug(req, res) {
  try {
    const festival = await festivalService.getFestivalBySlug(req.params.slug);
    if (!festival) {
      return res.status(404).json({ error: 'Festival not found.' });
    }
    res.json(festival);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch festival.' });
  }
}

/**
 * GET /api/festivals/:id/config
 * Returns full feature configuration for a festival.
 */
async function getConfig(req, res) {
  try {
    const festivalId = parseInt(req.params.id, 10);
    if (isNaN(festivalId)) {
      return res.status(400).json({ error: 'Invalid festival ID.' });
    }

    const festival = await festivalService.getFestivalById(festivalId);
    if (!festival) {
      return res.status(404).json({ error: 'Festival not found.' });
    }

    const modules = await festivalService.getFestivalConfig(festivalId);
    res.json({
      event: festival,
      modules,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch festival config.' });
  }
}

/**
 * GET /api/festivals/:id/features
 * Returns only enabled features for a festival.
 */
async function getEnabledFeatures(req, res) {
  try {
    const festivalId = parseInt(req.params.id, 10);
    if (isNaN(festivalId)) {
      return res.status(400).json({ error: 'Invalid festival ID.' });
    }

    const features = await festivalService.getEnabledFeatures(festivalId);
    res.json(features);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch features.' });
  }
}

/**
 * PUT /api/festivals/:festivalId/features/:featureId/toggle
 */
async function toggleFeature(req, res) {
  try {
    const festivalId = parseInt(req.params.festivalId, 10);
    const featureId = parseInt(req.params.featureId, 10);
    const { isEnabled } = req.body;

    if (isNaN(festivalId) || isNaN(featureId)) {
      return res.status(400).json({ error: 'Invalid IDs.' });
    }

    await festivalService.toggleFeature(festivalId, featureId, !!isEnabled);
    res.json({ message: 'Feature toggled successfully.' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to toggle feature.' });
  }
}

module.exports = { list, getBySlug, getConfig, getEnabledFeatures, toggleFeature };
