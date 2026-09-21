const express = require('express');
const { protect, authorize } = require('../middleware/authMiddleware');
const { validateObjectIdParams } = require('../middleware/validate');
const { listDivisions, createDivision, updateDivision, deleteDivision, listOrganizationDivisions, createOrganizationDivision, updateOrganizationDivision } = require('../controllers/division.controller');

const router = express.Router();
router.use(protect);
router.get('/', listDivisions);
router.get('/organization', listOrganizationDivisions);
router.post('/organization', createOrganizationDivision);
router.put('/organization/:id', validateObjectIdParams('id'), updateOrganizationDivision);
router.post('/', authorize('organization_admin', 'project_manager'), createDivision);
router.put('/:id', authorize('organization_admin', 'project_manager'), validateObjectIdParams('id'), updateDivision);
router.delete('/:id', authorize('organization_admin', 'project_manager'), validateObjectIdParams('id'), deleteDivision);
module.exports = router;
