const Division = require('../models/Division');
const Project = require('../models/Project');
const User = require('../models/User');
const Task = require('../models/Task');
const OrganizationDivision = require('../models/OrganizationDivision');
const { isValidObjectId } = require('../utils/validation');

const projectAccess = (project, user) => user.role === 'organization_admin' || String(project.managerId) === user.id || project.members.some(id => String(id) === user.id);

const validateMembers = async (project, organizationId, members = []) => {
  const ids = [...new Set(members.map(String))];
  if (ids.some(id => !isValidObjectId(id))) throw new Error('One or more member IDs are invalid');
  const valid = await User.find({ _id: { $in: ids }, organizationId, isActive: true }).select('_id divisionCapabilities');
  if (valid.length !== ids.length) throw new Error('All division members must be active users in this organization');
  const projectUsers = new Set([...project.members.map(String), String(project.managerId)]);
  if (ids.some(id => !projectUsers.has(id))) throw new Error('Division members must belong to the project');
  return ids;
};

const listOrganizationDivisions = async (req, res) => {
  try {
    const data = await OrganizationDivision.find({ organizationId: req.user.organizationId }).sort('name');
    res.json({ success: true, data });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};

const createOrganizationDivision = async (req, res) => {
  try {
    if (req.user.role !== 'organization_admin') return res.status(403).json({ success: false, message: 'Only organization admins can manage division types' });
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ success: false, message: 'Division name is required' });
    const data = await OrganizationDivision.create({ organizationId: req.user.organizationId, name, description: req.body.description, createdBy: req.user.id });
    res.status(201).json({ success: true, data });
  } catch (error) { res.status(error.code === 11000 ? 409 : 400).json({ success: false, message: error.message }); }
};

const updateOrganizationDivision = async (req, res) => {
  try {
    if (req.user.role !== 'organization_admin') return res.status(403).json({ success: false, message: 'Only organization admins can manage division types' });
    const update = {};
    if (req.body.name !== undefined) update.name = String(req.body.name).trim();
    if (req.body.description !== undefined) update.description = req.body.description;
    if (req.body.isActive !== undefined) update.isActive = Boolean(req.body.isActive);
    const data = await OrganizationDivision.findOneAndUpdate({ _id: req.params.id, organizationId: req.user.organizationId }, update, { new: true, runValidators: true });
    if (!data) return res.status(404).json({ success: false, message: 'Organization division not found' });
    res.json({ success: true, data });
  } catch (error) { res.status(error.code === 11000 ? 409 : 400).json({ success: false, message: error.message }); }
};

const getProject = (req, projectId) => Project.findOne({ _id: projectId, organizationId: req.user.organizationId });

const listDivisions = async (req, res) => {
  try {
    if (!isValidObjectId(req.query.projectId)) return res.status(400).json({ success: false, message: 'projectId is invalid' });
    const project = await getProject(req, req.query.projectId);
    if (!project || !projectAccess(project, req.user)) return res.status(project ? 403 : 404).json({ success: false, message: project ? 'Not authorized to view divisions' : 'Project not found' });
    const data = await Division.find({ organizationId: req.user.organizationId, projectId: project._id }).populate('organizationDivisionId', 'name isActive').populate('members', 'firstName lastName email role isActive divisionCapabilities').sort('name');
    res.json({ success: true, data });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};

const createDivision = async (req, res) => {
  try {
    const { projectId, name, description, members = [], organizationDivisionId } = req.body;
    if (!isValidObjectId(projectId) || !name?.trim()) return res.status(400).json({ success: false, message: 'Project and division name are required' });
    const project = await getProject(req, projectId);
    if (!project) return res.status(404).json({ success: false, message: 'Project not found' });
    if (req.user.role !== 'organization_admin' && String(project.managerId) !== req.user.id) return res.status(403).json({ success: false, message: 'Only the organization admin or project manager can manage divisions' });
    if (!organizationDivisionId) return res.status(400).json({ success: false, message: 'A valid organization division is required' });
    const memberIds = await validateMembers(project, req.user.organizationId, members);
    let orgDivision = null;
    if (organizationDivisionId) orgDivision = await OrganizationDivision.findOne({ _id: organizationDivisionId, organizationId: req.user.organizationId, isActive: true });
    if (organizationDivisionId && !orgDivision) return res.status(400).json({ success: false, message: 'Organization division is invalid' });
    if (orgDivision && memberIds.length) {
      const users = await User.find({ _id: { $in: memberIds }, divisionCapabilities: orgDivision._id }).select('_id');
      if (users.length !== memberIds.length) return res.status(400).json({ success: false, message: 'All members must have the organization division capability' });
    }
    const data = await Division.create({ organizationId: req.user.organizationId, projectId, organizationDivisionId: orgDivision?._id, name: name.trim(), description, members: memberIds, createdBy: req.user.id });
    res.status(201).json({ success: true, data });
  } catch (error) { res.status(error.code === 11000 ? 409 : 400).json({ success: false, message: error.message }); }
};

const updateDivision = async (req, res) => {
  try {
    const division = await Division.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
    if (!division) return res.status(404).json({ success: false, message: 'Division not found' });
    const project = await getProject(req, division.projectId);
    if (!project || (req.user.role !== 'organization_admin' && String(project.managerId) !== req.user.id)) return res.status(403).json({ success: false, message: 'Not authorized to manage this division' });
    const update = {};
    if (req.body.name !== undefined) update.name = String(req.body.name).trim();
    if (req.body.description !== undefined) update.description = req.body.description;
    if (req.body.members !== undefined) {
      const memberIds = await validateMembers(project, req.user.organizationId, req.body.members);
      if (division.organizationDivisionId && memberIds.length) {
        const users = await User.find({ _id: { $in: memberIds }, divisionCapabilities: division.organizationDivisionId }).select('_id');
        if (users.length !== memberIds.length) return res.status(400).json({ success: false, message: 'All members must have the organization division capability' });
      }
      update.members = memberIds;
    }
    const data = await Division.findByIdAndUpdate(division._id, update, { new: true, runValidators: true }).populate('members', 'firstName lastName email role isActive');
    res.json({ success: true, data });
  } catch (error) { res.status(error.code === 11000 ? 409 : 400).json({ success: false, message: error.message }); }
};

const deleteDivision = async (req, res) => {
  try {
    const division = await Division.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
    if (!division) return res.status(404).json({ success: false, message: 'Division not found' });
    const project = await getProject(req, division.projectId);
    if (!project || (req.user.role !== 'organization_admin' && String(project.managerId) !== req.user.id)) return res.status(403).json({ success: false, message: 'Not authorized to delete this division' });
    const taskCount = await Task.countDocuments({ organizationId: req.user.organizationId, divisionId: division._id });
    if (taskCount > 0) return res.status(400).json({ success: false, message: `Cannot delete division. ${taskCount} task(s) still reference it.` });
    await division.deleteOne();
    res.json({ success: true, message: 'Division deleted' });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};

module.exports = { listDivisions, createDivision, updateDivision, deleteDivision, listOrganizationDivisions, createOrganizationDivision, updateOrganizationDivision };
