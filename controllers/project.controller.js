const Project = require('../models/Project');
const Division = require('../models/Division');
const OrganizationDivision = require('../models/OrganizationDivision');
const User = require('../models/User');
const ActivityLog = require('../models/ActivityLog');
const { isValidObjectId, parsePagination } = require('../utils/validation');

const getProjectUserIds = async (organizationId, managerId, members = []) => {
  const ids = [managerId, ...members].filter(Boolean).map(String);
  if (ids.some(id => !isValidObjectId(id))) throw new Error('Project manager or member ID is invalid');
  const users = await User.find({ _id: { $in: [...new Set(ids)] }, organizationId, isActive: true }).select('_id');
  if (users.length !== new Set(ids).size) throw new Error('All project users must be active members of this organization');
  return [...new Set(ids)];
};

// @desc    Get all projects for organization
// @route   GET /api/projects
// @access  Private
const getProjects = async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 20 });
    const query = { organizationId: req.user.organizationId };

    // Role-based visibility
    if (req.user.role === 'employee' || req.user.role === 'viewer') {
      // Employees only see projects they are members of or manage
      query.$or = [{ members: req.user.id }, { managerId: req.user.id }];
    } else if (req.user.role === 'team_lead' || req.user.role === 'project_manager') {
       query.$or = [{ members: req.user.id }, { managerId: req.user.id }];
    }
    // Org Admin sees all.

    // Filters
    if (req.query.status) query.status = req.query.status;

    const [total, projects] = await Promise.all([
      Project.countDocuments(query),
      Project.find(query).populate('managerId', 'firstName lastName email profileImage').sort('-createdAt').skip(skip).limit(limit),
    ]);

    res.status(200).json({ success: true, count: projects.length, pagination: { page, limit, total, totalPages: Math.ceil(total / limit), pages: Math.ceil(total / limit) }, data: projects });
  } catch (error) {
    if (/Page|Limit/.test(error.message)) return res.status(400).json({ success: false, message: error.message });
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get single project
// @route   GET /api/projects/:id
// @access  Private
const getProject = async (req, res) => {
  try {
    const project = await Project.findOne({
      _id: req.params.id,
      organizationId: req.user.organizationId,
    })
      .populate('managerId', 'firstName lastName email profileImage')
      .populate('members', 'firstName lastName email role profileImage department isActive divisionCapabilities');

    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }

    // Access check for lower roles
    if (
      req.user.role !== 'organization_admin' &&
      project.managerId?._id?.toString() !== req.user.id &&
      !project.members.some((m) => m._id.toString() === req.user.id)
    ) {
      return res.status(403).json({ success: false, message: 'Not authorized to view this project' });
    }

    res.status(200).json({ success: true, data: project });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getProjectSummary = async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const project = await Project.findOne({ _id: req.params.id, organizationId: req.user.organizationId }).select('managerId members');
    if (!project) return res.status(404).json({ success: false, message: 'Project not found' });
    if (req.user.role !== 'organization_admin' && String(project.managerId) !== req.user.id && !project.members.some(member => String(member) === req.user.id)) {
      return res.status(403).json({ success: false, message: 'Not authorized to view this project' });
    }
    const now = new Date();

    // Use req.user.organizationId (not project.organizationId which was not selected) and cast to ObjectId
    const taskMatch = {
      organizationId: new mongoose.Types.ObjectId(req.user.organizationId),
      projectId: new mongoose.Types.ObjectId(req.params.id),
    };
    // Employees only see their own task stats; managers/admins see project-wide
    if (req.user.role === 'employee') {
      taskMatch.assignedTo = new mongoose.Types.ObjectId(req.user.id);
    }

    const [summary] = await require('../models/Task').aggregate([
      { $match: taskMatch },
      { $facet: {
        totals: [{ $group: { _id: null, totalTasks: { $sum: 1 }, completedTasks: { $sum: { $cond: [{ $eq: ['$status', 'Done'] }, 1, 0] } }, overdueTasks: { $sum: { $cond: [{ $and: [{ $ne: ['$status', 'Done'] }, { $ne: ['$dueDate', null] }, { $lt: ['$dueDate', now] }] }, 1, 0] } } } }],
        statusBreakdown: [{ $group: { _id: '$status', count: { $sum: 1 } } }, { $sort: { _id: 1 } }],
        priorityBreakdown: [{ $group: { _id: '$priority', count: { $sum: 1 } } }, { $sort: { _id: 1 } }],
        divisionBreakdown: [{ $group: { 
          _id: '$divisionId', 
          total: { $sum: 1 }, 
          done: { $sum: { $cond: [{ $eq: ['$status', 'Done'] }, 1, 0] } },
          inProgress: { $sum: { $cond: [{ $eq: ['$status', 'In Progress'] }, 1, 0] } },
          todo: { $sum: { $cond: [{ $eq: ['$status', 'To Do'] }, 1, 0] } }
        } }]
      } },
    ]);
    const totals = summary?.totals?.[0] || { totalTasks: 0, completedTasks: 0, overdueTasks: 0 };
    res.status(200).json({ success: true, data: {
      totalTasks: totals.totalTasks,
      completedTasks: totals.completedTasks,
      openTasks: totals.totalTasks - totals.completedTasks,
      overdueTasks: totals.overdueTasks,
      progress: totals.totalTasks ? Math.round((totals.completedTasks / totals.totalTasks) * 100) : 0,
      statusBreakdown: summary.statusBreakdown,
      priorityBreakdown: summary.priorityBreakdown,
      divisionBreakdown: summary.divisionBreakdown,
    } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load project summary' });
  }
};

// @desc    Create new project
// @route   POST /api/projects
// @access  Private (OrgAdmin, ProjectManager)
const createProject = async (req, res) => {
  try {
    const { managerId, members = [] } = req.body;
    if (!managerId || !isValidObjectId(managerId) || !Array.isArray(members)) {
      return res.status(400).json({ success: false, message: 'A valid manager and member list are required' });
    }
    const validMembers = await getProjectUserIds(req.user.organizationId, managerId, members);
    req.body.organizationId = req.user.organizationId;
    req.body.createdBy = req.user.id;
    req.body.managerId = managerId;
    req.body.members = validMembers;
    
    // Auto add manager to members if not present
    const project = await Project.create(req.body);

    await ActivityLog.create({
      organizationId: req.user.organizationId,
      userId: req.user.id,
      entityType: 'project',
      entityId: project._id,
      action: 'created',
    });

    res.status(201).json({ success: true, data: project });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'Project code already exists' });
    }
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update project
// @route   PUT /api/projects/:id
// @access  Private (OrgAdmin, ProjectManager)
const updateProject = async (req, res) => {
  try {
    delete req.body.organizationId; // Prevent changing org
    delete req.body.createdBy;
    delete req.body._id;
    
    let project = await Project.findOne({
      _id: req.params.id,
      organizationId: req.user.organizationId,
    });

    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }

    // Access check
    if (req.user.role !== 'organization_admin' && project.managerId.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Not authorized to update this project' });
    }

    if (req.body.managerId !== undefined || req.body.members !== undefined) {
      const managerId = req.body.managerId || project.managerId;
      const members = req.body.members === undefined ? project.members : req.body.members;
      if (!Array.isArray(members) || !isValidObjectId(managerId)) {
        return res.status(400).json({ success: false, message: 'Invalid project manager or member list' });
      }
      req.body.managerId = managerId;
      req.body.members = await getProjectUserIds(req.user.organizationId, managerId, members);
    }

    project = await Project.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    await ActivityLog.create({
      organizationId: req.user.organizationId,
      userId: req.user.id,
      entityType: 'project',
      entityId: project._id,
      action: 'updated',
    });

    res.status(200).json({ success: true, data: project });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update project members
// @route   PUT /api/projects/:id/members
// @access  Private (Admin/Manager)
const manageMembers = async (req, res) => {
  try {
    const { action, userId, divisionNames = [] } = req.body;
    const project = await Project.findOne({ _id: req.params.id, organizationId: req.user.organizationId });

    if (!project) return res.status(404).json({ success: false, message: 'Project not found' });
    if (req.user.role !== 'organization_admin' && project.managerId.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Only the project manager or organization admin can manage members' });
    }

    if (action === 'add') {
      // Check if user belongs to same org
      const userToAdd = await User.findOne({ _id: userId, organizationId: req.user.organizationId, isActive: true });
      if (!userToAdd) return res.status(404).json({ success: false, message: 'User not found in organization' });

      if (project.members.some(id => id.toString() === String(userId))) {
        return res.status(400).json({ success: false, message: 'User already in project' });
      }
      project.members.push(userId);
      const names = [...new Set((Array.isArray(divisionNames) ? divisionNames : []).map(name => String(name).trim()).filter(Boolean))];
      const createdDivisions = [];
      try {
        for (const name of names) {
          let orgDivision = await OrganizationDivision.findOne({ organizationId: req.user.organizationId, name, isActive: true });
          if (!orgDivision && req.user.role === 'organization_admin') orgDivision = await OrganizationDivision.create({ organizationId: req.user.organizationId, name, createdBy: req.user.id });
          if (!orgDivision) throw new Error(`Organization division '${name}' does not exist`);
          if (!(userToAdd.divisionCapabilities || []).some(id => String(id) === String(orgDivision._id))) throw new Error(`${userToAdd.firstName} does not have the '${name}' capability`);
          let division = await Division.findOne({ organizationId: req.user.organizationId, projectId: project._id, organizationDivisionId: orgDivision._id });
          if (!division) {
            division = await Division.create({ organizationId: req.user.organizationId, projectId: project._id, organizationDivisionId: orgDivision._id, name: orgDivision.name, createdBy: req.user.id, members: [] });
            createdDivisions.push(division._id);
          }
          if (!division.members.some(id => String(id) === String(userId))) {
            division.members.push(userId);
            await division.save();
          }
        }
        await project.save();
      } catch (error) {
        await Division.updateMany({ _id: { $in: createdDivisions }, organizationId: req.user.organizationId }, { $pull: { members: userId } });
        await Division.deleteMany({ _id: { $in: createdDivisions }, organizationId: req.user.organizationId, members: { $size: 0 } });
        throw error;
      }
    } else if (action === 'remove') {
      // Check for active assigned tasks
      const Task = require('../models/Task');
      if (!project.members.some(id => id.toString() === String(userId))) {
        return res.status(400).json({ success: false, message: 'User is not a member of this project' });
      }
      const activeTasks = await Task.countDocuments({
        organizationId: req.user.organizationId,
        projectId: project._id, 
        assignedTo: userId, 
        status: { $ne: 'Done' } 
      });

      if (activeTasks > 0) {
        return res.status(400).json({ 
          success: false, 
          message: `Cannot remove member. They have ${activeTasks} active task(s) in this project.` 
        });
      }

      project.members = project.members.filter(id => id.toString() !== String(userId));
      await Division.updateMany({ organizationId: req.user.organizationId, projectId: project._id }, { $pull: { members: userId } });
    } else {
      return res.status(400).json({ success: false, message: 'Invalid action' });
    }

    if (action !== 'add') await project.save();
    res.status(200).json({ success: true, data: project });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Delete / Archive project
// @route   DELETE /api/projects/:id
// @access  Private (OrgAdmin)
const deleteProject = async (req, res) => {
  try {
    const project = await Project.findOne({
      _id: req.params.id,
      organizationId: req.user.organizationId,
    });

    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }

    // Only org admin can delete
    if (req.user.role !== 'organization_admin') {
      return res.status(403).json({ success: false, message: 'Only organization admins can delete projects' });
    }

    // Soft delete: archive instead of hard delete to preserve history
    const Task = require('../models/Task');
    const taskCount = await Task.countDocuments({ projectId: project._id });

    if (taskCount > 0 && req.query.force !== 'true') {
      // Archive instead
      project.status = 'Archived';
      await project.save();

      await ActivityLog.create({
        organizationId: req.user.organizationId,
        userId: req.user.id,
        entityType: 'project',
        entityId: project._id,
        action: 'archived',
        metadata: { name: project.name },
      });

      return res.status(200).json({ success: true, archived: true, message: 'Project archived (has tasks). Use ?force=true to permanently delete.' });
    }

    // Hard delete if no tasks or force=true
    await Task.deleteMany({ projectId: project._id });
    await Project.findByIdAndDelete(project._id);

    await ActivityLog.create({
      organizationId: req.user.organizationId,
      userId: req.user.id,
      entityType: 'project',
      entityId: project._id,
      action: 'deleted',
      metadata: { name: project.name },
    });

    res.status(200).json({ success: true, data: {} });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getProjects,
  getProject,
  getProjectSummary,
  createProject,
  updateProject,
  manageMembers,
  deleteProject,
};
