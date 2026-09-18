const express = require('express');
const { getComments, addComment, updateComment, deleteComment } = require('../controllers/comment.controller');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);

// POST /api/comments  - add a new comment
router.post('/', addComment);

// GET /api/comments/task/:taskId  - get comments for a task
router.get('/task/:taskId', getComments);

// PUT /api/comments/:id  - update a comment
router.put('/:id', updateComment);

// DELETE /api/comments/:id  - delete a comment
router.delete('/:id', deleteComment);

module.exports = router;
