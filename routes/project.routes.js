const express = require('express');
const {
  getProjects,
  getProject,
  createProject,
  updateProject,
  manageMembers,
  deleteProject,
} = require('../controllers/project.controller');
const { protect, authorize } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);

router
  .route('/')
  .get(getProjects)
  .post(authorize('organization_admin', 'project_manager'), createProject);

router
  .route('/:id')
  .get(getProject)
  .put(authorize('organization_admin', 'project_manager'), updateProject)
  .delete(authorize('organization_admin'), deleteProject);

router
  .route('/:id/members')
  .put(authorize('organization_admin', 'project_manager'), manageMembers);

module.exports = router;
