const express = require('express');
const { getCalendarEvents } = require('../controllers/calendar.controller');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);

router.get('/', getCalendarEvents);

module.exports = router;
