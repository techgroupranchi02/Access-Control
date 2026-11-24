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
// Group Config (docs/adr/0009-team-group-config.md): reads need team:view; changes need team:manage and festival Admin
router.get('/groups', requirePermission('team:view'), teamController.groupsOverview);
router.get('/custom-groups', requirePermission('team:view'), teamController.listCustomGroups);
router.get('/custom-groups/:id', requirePermission('team:view'), teamController.getCustomGroup);
router.get('/custom-groups/:id/usage', requirePermission('team:view'), teamController.customGroupUsage);
router.post('/custom-groups', requirePermission('team:manage'), teamController.createCustomGroup);
router.put('/custom-groups/:id', requirePermission('team:manage'), teamController.updateCustomGroup);
router.delete('/custom-groups/:id', requirePermission('team:manage'), teamController.deleteCustomGroup);
// Invitations for people without a usable Freecomers account (docs/adr/0008-team-invitations.md)
router.get('/invitations', requirePermission('team:view'), teamController.listInvitations);
router.get('/invitations/:id/text', requirePermission('team:manage'), teamController.invitationText);
router.post('/invitations/:id/resend', requirePermission('team:manage'), teamController.resendInvitation);
router.put('/invitations/:id', requirePermission('team:manage'), teamController.updateInvitation);
router.delete('/invitations/:id', requirePermission('team:manage'), teamController.revokeInvitation);
router.get('/', requirePermission('team:view'), teamController.list);
router.post('/', requirePermission('team:manage'), teamController.create);
router.get('/:id', requirePermission('team:view'), teamController.getById);
router.put('/:id', requirePermission('team:manage'), teamController.update);
router.delete('/:id', requirePermission('team:manage'), teamController.remove);

module.exports = router;
