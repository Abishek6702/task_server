const express = require('express');
const { getDashboardReports, getWorkloadReport } = require('../controllers/reports.controller');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);

router.get('/dashboard', getDashboardReports);
router.get('/workload', getWorkloadReport);

module.exports = router;
