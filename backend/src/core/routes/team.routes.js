/**
 * Team Routes
 * Endpoints for managing festival staff, juries, volunteers, and departments.
 */

const express = require('express');
const router = express.Router();
const teamController = require('../controllers/team.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { requirePermission } = require('../middleware/permission.middleware');

router.use(authenticate);

router.get('/search', requirePermission('team:view'), teamController.searchIndividuals);
router.get('/custom-groups', requirePermission('team:view'), teamController.listCustomGroups);
router.post('/custom-groups', requirePermission('team:manage'), teamController.createCustomGroup);
router.delete('/custom-groups/:id', requirePermission('team:manage'), teamController.deleteCustomGroup);
router.get('/', requirePermission('team:view'), teamController.list);
router.post('/', requirePermission('team:manage'), teamController.create);
router.get('/:id', requirePermission('team:view'), teamController.getById);
router.put('/:id', requirePermission('team:manage'), teamController.update);
router.delete('/:id', requirePermission('team:manage'), teamController.remove);

module.exports = router;
