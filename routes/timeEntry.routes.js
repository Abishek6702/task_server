const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const { validateObjectIdParams } = require('../middleware/validate');
const { createEntry, startTimer, stopTimer, listTaskEntries, listMyEntries, updateEntry, deleteEntry } = require('../controllers/timeEntry.controller');

const router = express.Router();
router.use(protect);
router.get('/my', listMyEntries);
router.get('/task/:taskId', validateObjectIdParams('taskId'), listTaskEntries);
router.post('/', createEntry);
router.post('/start', startTimer);
router.post('/stop/:id', validateObjectIdParams('id'), stopTimer);
router.put('/:id', validateObjectIdParams('id'), updateEntry);
router.delete('/:id', validateObjectIdParams('id'), deleteEntry);
module.exports = router;
