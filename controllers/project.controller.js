const Project = require('../models/Project');
const User = require('../models/User');
const ActivityLog = require('../models/ActivityLog');

// @desc    Get all projects for organization
// @route   GET /api/projects
// @access  Private
const getProjects = async (req, res) => {
  try {
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

    const projects = await Project.find(query)
      .populate('managerId', 'firstName lastName email profileImage')
      .sort('-createdAt');

    res.status(200).json({ success: true, count: projects.length, data: projects });
  } catch (error) {
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
      .populate('members', 'firstName lastName email role profileImage department');

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

// @desc    Create new project
// @route   POST /api/projects
// @access  Private (OrgAdmin, ProjectManager)
const createProject = async (req, res) => {
  try {
    req.body.organizationId = req.user.organizationId;
    req.body.createdBy = req.user.id;
    
    // Auto add manager to members if not present
    if (req.body.managerId && req.body.members) {
      if (!req.body.members.includes(req.body.managerId)) {
        req.body.members.push(req.body.managerId);
      }
    }

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
    const { action, userId } = req.body;
    const project = await Project.findOne({ _id: req.params.id, organizationId: req.user.organizationId });

    if (!project) return res.status(404).json({ success: false, message: 'Project not found' });

    if (action === 'add') {
      // Check if user belongs to same org
      const userToAdd = await User.findOne({ _id: userId, organizationId: req.user.organizationId });
      if (!userToAdd) return res.status(404).json({ success: false, message: 'User not found in organization' });

      if (project.members.includes(userId)) {
        return res.status(400).json({ success: false, message: 'User already in project' });
      }
      project.members.push(userId);
    } else if (action === 'remove') {
      // Check for active assigned tasks
      const Task = require('../models/Task');
      const activeTasks = await Task.countDocuments({ 
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

      project.members = project.members.filter(id => id.toString() !== userId);
    } else {
      return res.status(400).json({ success: false, message: 'Invalid action' });
    }

    await project.save();
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
  createProject,
  updateProject,
  manageMembers,
  deleteProject,
};
