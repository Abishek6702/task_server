const express = require('express');
const {
  getTasks,
  getTask,
  createTask,
  updateTask,
  deleteTask,
  duplicateTask,
} = require('../controllers/task.controller');
const { protect } = require('../middleware/authMiddleware');
const { validateObjectIdParams } = require('../middleware/validate');

const router = express.Router();

router.use(protect);

router
  .route('/')
  .get(getTasks)
  .post(createTask);

router
  .route('/:id')
  .all(validateObjectIdParams('id'))
  .get(getTask)
  .put(updateTask)
  .delete(deleteTask);

router.route('/:id/duplicate').all(validateObjectIdParams('id')).post(duplicateTask);

module.exports = router;
