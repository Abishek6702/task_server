const express = require('express');
const {
  getProjects,
  getProject,
  getProjectSummary,
  createProject,
  updateProject,
  manageMembers,
  deleteProject,
} = require('../controllers/project.controller');
const { protect, authorize } = require('../middleware/authMiddleware');
const { validateObjectIdParams } = require('../middleware/validate');

const router = express.Router();

router.use(protect);

router
  .route('/')
  .get(getProjects)
  .post(authorize('organization_admin', 'project_manager'), createProject);

router
  .route('/:id')
  .all(validateObjectIdParams('id'))
  .get(getProject)
  .put(authorize('organization_admin', 'project_manager'), updateProject)
  .delete(authorize('organization_admin'), deleteProject);

router.get('/:id/summary', validateObjectIdParams('id'), getProjectSummary);

router
  .route('/:id/members')
  .all(validateObjectIdParams('id'))
  .put(authorize('organization_admin', 'project_manager'), manageMembers);

module.exports = router;
