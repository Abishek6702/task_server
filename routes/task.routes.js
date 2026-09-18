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

const router = express.Router();

router.use(protect);

router
  .route('/')
  .get(getTasks)
  .post(createTask);

router
  .route('/:id')
  .get(getTask)
  .put(updateTask)
  .delete(deleteTask);

router.route('/:id/duplicate').post(duplicateTask);

module.exports = router;
