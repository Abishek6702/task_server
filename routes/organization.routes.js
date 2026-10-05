const express = require('express');
const {
  getOrganizations,
  getOrganization,
  createOrganization,
  updateOrganization,
  getMyOrganization,
  updateMyOrganization,
} = require('../controllers/organization.controller');
const { protect, authorize } = require('../middleware/authMiddleware');
const { validateObjectIdParams } = require('../middleware/validate');

const router = express.Router();

router.use(protect);

router
  .route('/me')
  .get(getMyOrganization)
  .put(authorize('organization_admin'), updateMyOrganization);

router
  .route('/')
  .get(authorize('super_admin'), getOrganizations)
  .post(authorize('super_admin'), createOrganization);

router
  .route('/:id')
  .all(validateObjectIdParams('id'))
  .get(getOrganization)
  .put(authorize('super_admin', 'organization_admin'), updateOrganization);

module.exports = router;
