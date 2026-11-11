/**
 * Badge & pass template routes (/api/pass-templates), docs/adr/0005-pass-templates.md
 * Desk staff can list and read templates to print; only settings managers can change them.
 */

const express = require('express');
const { authenticate } = require('../middleware/auth.middleware');
const { requirePermission, requireModule } = require('../middleware/permission.middleware');
const controller = require('../controllers/pass-templates.controller');

const passTemplatesRouter = express.Router();
passTemplatesRouter.use(authenticate);
passTemplatesRouter.use(requireModule('audience'));

// Static paths first, so they aren't taken as a template id
passTemplatesRouter.post('/assets', requirePermission('settings.manage'), controller.uploadAsset);
passTemplatesRouter.post('/layout-preview', requirePermission('settings.manage'), controller.layoutPreview);
passTemplatesRouter.put('/qr-settings', requirePermission('settings.manage'), controller.saveQrSettings);
passTemplatesRouter.get('/', requirePermission('registration.view'), controller.listTemplates);
passTemplatesRouter.get('/:id', requirePermission('registration.view'), controller.getTemplate);
passTemplatesRouter.post('/', requirePermission('settings.manage'), controller.createTemplate);
passTemplatesRouter.put('/:id', requirePermission('settings.manage'), controller.updateTemplate);
passTemplatesRouter.post('/:id/duplicate', requirePermission('settings.manage'), controller.duplicateTemplate);
passTemplatesRouter.put('/:id/default', requirePermission('settings.manage'), controller.setDefaultTemplate);
passTemplatesRouter.delete('/:id', requirePermission('settings.manage'), controller.archiveTemplate);

module.exports = { passTemplatesRouter };
