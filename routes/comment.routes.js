const express = require('express');
const { getComments, addComment, updateComment, deleteComment } = require('../controllers/comment.controller');
const { protect } = require('../middleware/authMiddleware');
const { validateObjectIdParams } = require('../middleware/validate');

const router = express.Router();

router.use(protect);

// POST /api/comments  - add a new comment
router.post('/', addComment);

// GET /api/comments/task/:taskId  - get comments for a task
router.get('/task/:taskId', validateObjectIdParams('taskId'), getComments);

// PUT /api/comments/:id  - update a comment
router.put('/:id', validateObjectIdParams('id'), updateComment);

// DELETE /api/comments/:id  - delete a comment
router.delete('/:id', validateObjectIdParams('id'), deleteComment);

module.exports = router;
