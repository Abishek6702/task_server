const Task = require('../models/Task');
const Project = require('../models/Project');
const ActivityLog = require('../models/ActivityLog');
const Notification = require('../models/Notification');

// Helper to recalculate project progress
const updateProjectProgress = async (projectId, organizationId) => {
  const tasks = await Task.find({ projectId, parentTaskId: null, organizationId });
  if (tasks.length === 0) {
    await Project.findByIdAndUpdate(projectId, { progress: 0 });
    return;
  }
  const completed = tasks.filter(t => t.status === 'Done').length;
  const progress = Math.round((completed / tasks.length) * 100);
  await Project.findByIdAndUpdate(projectId, { progress });
};

// @desc    Get all tasks (with filters)
// @route   GET /api/tasks
// @access  Private
const getTasks = async (req, res) => {
  try {
    const query = { organizationId: req.user.organizationId };

    // Filters
    if (req.query.projectId) query.projectId = req.query.projectId;
    if (req.query.assignedTo) query.assignedTo = { $in: [req.query.assignedTo] };
    if (req.query.status) query.status = req.query.status;
    if (req.query.priority) query.priority = req.query.priority;
    if (req.query.parentTaskId) {
      query.parentTaskId = req.query.parentTaskId === 'null' ? null : req.query.parentTaskId;
    }

    // Role visibility: employees see tasks they're assigned to, or in their projects
    if (req.user.role === 'employee' || req.user.role === 'viewer') {
       if (!req.query.projectId) {
          const projects = await Project.find({ members: req.user.id, organizationId: req.user.organizationId }).select('_id');
          const projectIds = projects.map(p => p._id);
          query.$or = [{ assignedTo: { $in: [req.user.id] } }, { projectId: { $in: projectIds } }];
       }
    }

    // Pagination
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 50;
    const startIndex = (page - 1) * limit;

    const total = await Task.countDocuments(query);

    const tasks = await Task.find(query)
      .populate('assignedTo', 'firstName lastName profileImage')
      .populate('reportingTo', 'firstName lastName profileImage')
      .populate('projectId', 'name projectCode')
      .sort(req.query.sort || '-createdAt')
      .skip(startIndex)
      .limit(limit);

    res.status(200).json({ 
      success: true, 
      count: tasks.length,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      },
      data: tasks 
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get single task
// @route   GET /api/tasks/:id
// @access  Private
const getTask = async (req, res) => {
  try {
    const task = await Task.findOne({
      _id: req.params.id,
      organizationId: req.user.organizationId,
    })
      .populate('assignedTo', 'firstName lastName profileImage')
      .populate('createdBy', 'firstName lastName')
      .populate('reportingTo', 'firstName lastName profileImage')
      .populate('projectId', 'name projectCode members managerId');

    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }
    
    // Check access
    const project = task.projectId;
    if (
      req.user.role !== 'organization_admin' &&
      project.managerId.toString() !== req.user.id &&
      !project.members.includes(req.user.id)
    ) {
      return res.status(403).json({ success: false, message: 'Not authorized to view this task' });
    }

    res.status(200).json({ success: true, data: task });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Create new task
// @route   POST /api/tasks
// @access  Private (OrgAdmin, ProjectManager, TeamLead)
const createTask = async (req, res) => {
  try {
    const { projectId, assignedTo } = req.body;
    
    req.body.organizationId = req.user.organizationId;
    req.body.createdBy = req.user.id;
    if (assignedTo) req.body.assignedBy = req.user.id;

    // Validate project
    const project = await Project.findOne({
      _id: projectId,
      organizationId: req.user.organizationId,
    });

    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }

    // Access check for creating tasks
    // Subtasks can be created by any project member; top-level tasks require manager/admin/team_lead
    const isMember = project.members.map(m => m.toString()).includes(req.user.id);
    const isManager = project.managerId.toString() === req.user.id;
    const isOrgAdmin = req.user.role === 'organization_admin';
    const isTeamLead = req.user.role === 'team_lead' && isMember;
    const isSubtask = !!req.body.parentTaskId;

    if (!isOrgAdmin && !isManager && !isTeamLead && !(isSubtask && isMember)) {
      return res.status(403).json({ success: false, message: 'Not authorized to create tasks in this project' });
    }

    // Validate all assignees belong to project
    const assignedToArray = Array.isArray(assignedTo) ? assignedTo : (assignedTo ? [assignedTo] : []);
    if (assignedToArray.length > 0) {
      const memberIds = project.members.map(m => m.toString());
      const managerIdStr = project.managerId.toString();
      for (const uid of assignedToArray) {
        if (!memberIds.includes(uid.toString()) && managerIdStr !== uid.toString()) {
          return res.status(400).json({ success: false, message: 'One or more assignees are not members of this project' });
        }
      }
      req.body.assignedBy = req.user.id;
    }
    req.body.assignedTo = assignedToArray;

    // Always auto-generate taskCode on the backend to avoid frontend collisions
    const taskCount = await Task.countDocuments({ organizationId: req.user.organizationId });
    req.body.taskCode = `${project.projectCode}-${Date.now().toString(36).toUpperCase()}${taskCount + 1}`;

    const task = await Task.create(req.body);

    await ActivityLog.create({
      organizationId: req.user.organizationId,
      userId: req.user.id,
      entityType: 'task',
      entityId: task._id,
      action: 'created',
      metadata: { title: task.title },
    });

    // Notify all new assignees
    for (const uid of assignedToArray) {
      if (uid.toString() !== req.user.id) {
        await Notification.create({
          organizationId: req.user.organizationId,
          userId: uid,
          type: 'task_assigned',
          title: 'New Task Assigned',
          message: `You have been assigned to task: ${task.taskCode}`,
          taskId: task._id,
          projectId: project._id,
        });
      }
    }

    await updateProjectProgress(project._id, req.user.organizationId);

    res.status(201).json({ success: true, data: task });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'Task code already exists' });
    }
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update task
// @route   PUT /api/tasks/:id
// @access  Private
const updateTask = async (req, res) => {
  try {
    delete req.body.organizationId;
    delete req.body.projectId; // Prevent moving tasks between projects easily

    let task = await Task.findOne({
      _id: req.params.id,
      organizationId: req.user.organizationId,
    });

    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    // Access check: any assignee, manager, org_admin, or team_lead
    const project = await Project.findById(task.projectId);
    const currentAssignees = (task.assignedTo || []).map(id => id.toString());
    const isAssignee = currentAssignees.includes(req.user.id);
    const isManager = project.managerId.toString() === req.user.id;
    const isOrgAdmin = req.user.role === 'organization_admin';
    const isTeamLead = req.user.role === 'team_lead' && project.members.includes(req.user.id);

    if (!isAssignee && !isManager && !isOrgAdmin && !isTeamLead) {
       return res.status(403).json({ success: false, message: 'Not authorized to update this task' });
    }

    // Handle assignedTo update (array)
    if (req.body.assignedTo !== undefined) {
       const newAssignees = Array.isArray(req.body.assignedTo) ? req.body.assignedTo : (req.body.assignedTo ? [req.body.assignedTo] : []);
       if (newAssignees.length > 0) {
         if (!isManager && !isOrgAdmin && !isTeamLead) {
           return res.status(403).json({ success: false, message: 'Only managers or team leads can reassign tasks' });
         }
         const memberIds = project.members.map(m => m.toString());
         const managerIdStr = project.managerId.toString();
         for (const uid of newAssignees) {
           if (!memberIds.includes(uid.toString()) && managerIdStr !== uid.toString()) {
             return res.status(400).json({ success: false, message: 'One or more assignees are not members of this project' });
           }
         }
         req.body.assignedBy = req.user.id;
       }
       req.body.assignedTo = newAssignees;
    }

    if (req.body.status === 'Done' && task.status !== 'Done') {
       req.body.completedAt = Date.now();
       req.body.progress = 100;
    }

    const updatedTask = await Task.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    // If this is a subtask and status changed, update parent progress
    if (updatedTask.parentTaskId && req.body.status) {
       const subtasks = await Task.find({ parentTaskId: updatedTask.parentTaskId, organizationId: req.user.organizationId });
       const completed = subtasks.filter(st => st.status === 'Done').length;
       const progress = subtasks.length > 0 ? Math.round((completed / subtasks.length) * 100) : 0;
       await Task.findByIdAndUpdate(updatedTask.parentTaskId, { progress });
    }

    const changes = {};
    if (req.body.status && req.body.status !== task.status) {
      changes.status = { from: task.status, to: req.body.status };
    }
    if (req.body.priority && req.body.priority !== task.priority) {
      changes.priority = { from: task.priority, to: req.body.priority };
    }
    if (req.body.assignedTo !== undefined) {
      changes.assignedTo = { from: task.assignedTo, to: req.body.assignedTo };
    }
    if (req.body.dueDate && req.body.dueDate !== task.dueDate?.toISOString()?.split('T')[0]) {
      changes.dueDate = { from: task.dueDate, to: req.body.dueDate };
    }

    const actionLabel = Object.keys(changes).length > 0
      ? Object.entries(changes).map(([field, v]) => `${field}: ${v.from} → ${v.to}`).join(', ')
      : 'updated';

    await ActivityLog.create({
      organizationId: req.user.organizationId,
      userId: req.user.id,
      entityType: 'task',
      entityId: task._id,
      action: actionLabel,
      metadata: { taskCode: task.taskCode, changes },
    });

    // Notify newly added assignees
    if (changes.assignedTo) {
      const newAssignees = Array.isArray(req.body.assignedTo) ? req.body.assignedTo : [];
      const oldAssignees = (task.assignedTo || []).map(id => id.toString());
      for (const uid of newAssignees) {
        if (!oldAssignees.includes(uid.toString()) && uid.toString() !== req.user.id) {
          await Notification.create({
            organizationId: req.user.organizationId,
            userId: uid,
            type: 'task_assigned',
            title: 'Task Assigned to You',
            message: `Task ${updatedTask.taskCode} has been assigned to you`,
            taskId: updatedTask._id,
            projectId: updatedTask.projectId,
          });
        }
      }
    }

    if (req.body.status) {
      await updateProjectProgress(updatedTask.projectId, req.user.organizationId);
    }

    res.status(200).json({ success: true, data: updatedTask });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Delete task
// @route   DELETE /api/tasks/:id
// @access  Private
const deleteTask = async (req, res) => {
  try {
    const task = await Task.findOne({
      _id: req.params.id,
      organizationId: req.user.organizationId,
    });

    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    // Access check: only manager, org_admin or team_lead can delete
    const project = await Project.findById(task.projectId);
    const isManager = project.managerId.toString() === req.user.id;
    const isOrgAdmin = req.user.role === 'organization_admin';
    const isTeamLead = req.user.role === 'team_lead' && project.members.includes(req.user.id);

    if (!isManager && !isOrgAdmin && !isTeamLead) {
       return res.status(403).json({ success: false, message: 'Not authorized to delete this task' });
    }

    // Delete subtasks if any
    await Task.deleteMany({ parentTaskId: task._id, organizationId: req.user.organizationId });
    await Task.findByIdAndDelete(task._id);

    await ActivityLog.create({
      organizationId: req.user.organizationId,
      userId: req.user.id,
      entityType: 'task',
      entityId: task._id,
      action: 'deleted',
    });

    await updateProjectProgress(task.projectId, req.user.organizationId);

    res.status(200).json({ success: true, data: {} });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Duplicate task
// @route   POST /api/tasks/:id/duplicate
// @access  Private
const duplicateTask = async (req, res) => {
  try {
    const task = await Task.findOne({
      _id: req.params.id,
      organizationId: req.user.organizationId,
    });

    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    const project = await Project.findById(task.projectId);
    if (
      req.user.role !== 'organization_admin' &&
      project.managerId.toString() !== req.user.id &&
      !project.members.includes(req.user.id)
    ) {
      return res.status(403).json({ success: false, message: 'Not authorized to duplicate task in this project' });
    }

    const taskCount = await Task.countDocuments({ projectId: task.projectId });
    const newTaskCode = `${project.projectCode}-${taskCount + 1 + Math.floor(Math.random() * 1000)}`;

    const newTaskData = {
      taskCode: newTaskCode,
      title: `${task.title} (Copy)`,
      description: task.description,
      organizationId: task.organizationId,
      projectId: task.projectId,
      parentTaskId: task.parentTaskId,
      createdBy: req.user.id,
      priority: task.priority,
      estimatedHours: task.estimatedHours,
      labels: task.labels,
      status: 'To Do',
      progress: 0,
    };

    const duplicatedTask = await Task.create(newTaskData);

    await ActivityLog.create({
      organizationId: req.user.organizationId,
      userId: req.user.id,
      entityType: 'task',
      entityId: duplicatedTask._id,
      action: 'created',
      metadata: { title: duplicatedTask.title, notes: 'Duplicated from ' + task.taskCode },
    });

    await updateProjectProgress(project._id, req.user.organizationId);

    res.status(201).json({ success: true, data: duplicatedTask });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getTasks,
  getTask,
  createTask,
  updateTask,
  deleteTask,
  duplicateTask,
};
