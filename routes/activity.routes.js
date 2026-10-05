const express = require('express');
const { getActivities } = require('../controllers/activity.controller');
const { protect } = require('../middleware/authMiddleware');
const { validateObjectIdParams } = require('../middleware/validate');

const router = express.Router();

router.use(protect);

router.route('/:entityType/:entityId').all(validateObjectIdParams('entityId')).get(getActivities);

module.exports = router;
