const express = require('express');
const router = express.Router();
const { authenticate } = require('../../core/middleware/auth.middleware');
const { requirePermission, requireFeature } = require('../../core/middleware/permission.middleware');

router.use(authenticate);
router.use(requireFeature('customC'));

router.get('/', requirePermission('customC:read'), (req, res) => {
    res.json([
        { id: 1, title: 'Custom C Demo Item 1', category: 'General', status: 'Active' },
        { id: 2, title: 'Custom C Demo Item 2', category: 'Special', status: 'Pending' }
    ]);
});

module.exports = router;
