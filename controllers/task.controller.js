const Task = require('../models/Task');
const Project = require('../models/Project');
const ActivityLog = require('../models/ActivityLog');
const User = require('../models/User');
const Division = require('../models/Division');
const { isValidObjectId, parsePagination } = require('../utils/validation');
const notificationService = require('../utils/notificationService');

const validateTaskRelations = async ({ organizationId, project, divisionId, assignedTo = [], parentTaskId, dependencies = [] }) => {
  const ids = [...new Set(assignedTo.map(String))];
  if (ids.some(id => !isValidObjectId(id))) throw new Error('One or more assignee IDs are invalid');
  if (ids.length) {
    const users = await User.find({ _id: { $in: ids }, organizationId, isActive: true }).select('_id');
    if (users.length !== ids.length) throw new Error('All assignees must be active users in this organization');
    const projectMembers = new Set([...project.members.map(String), project.managerId.toString()]);
    if (ids.some(id => !projectMembers.has(id))) throw new Error('All assignees must belong to the project');
    if (divisionId !== undefined && divisionId !== null && divisionId !== '') {
      if (!isValidObjectId(divisionId)) throw new Error('Division ID is invalid');
      const division = await Division.findOne({ _id: divisionId, organizationId, projectId: project._id }).select('members organizationDivisionId');
      if (!division) throw new Error('Division must belong to the same project and organization');
      const divisionMembers = new Set(division.members.map(String));
      
      for (const id of ids) {
        if (!divisionMembers.has(id)) {
          const u = await User.findById(id).select('divisionCapabilities role');
          if (!u) throw new Error('User not found');
          // Allow if they have the capability (mainly for employees who can self-assign based on capabilities)
          const hasCap = u.divisionCapabilities?.some(cap => String(cap) === String(division.organizationDivisionId));
          if (!hasCap && u.role !== 'organization_admin') {
            throw new Error('All assignees must belong to the selected division or have its capability');
          }
        }
      }
    }
  } else if (divisionId !== undefined && divisionId !== null && divisionId !== '') {
    if (!isValidObjectId(divisionId) || !(await Division.exists({ _id: divisionId, organizationId, projectId: project._id }))) throw new Error('Division must belong to the same project and organization');
  }
  if (parentTaskId !== undefined && parentTaskId !== null) {
    if (!isValidObjectId(parentTaskId)) throw new Error('Parent task ID is invalid');
    const parent = await Task.findOne({ _id: parentTaskId, organizationId, projectId: project._id });
    if (!parent) throw new Error('Parent task must belong to the same project and organization');
  }
  const dependencyIds = [...new Set(dependencies.map(String))];
  if (dependencyIds.some(id => !isValidObjectId(id))) throw new Error('One or more dependency IDs are invalid');
  if (dependencyIds.includes(String(parentTaskId))) throw new Error('A task cannot depend on its parent task');
  if (dependencyIds.length) {
    const count = await Task.countDocuments({ _id: { $in: dependencyIds }, organizationId, projectId: project._id });
    if (count !== dependencyIds.length) throw new Error('Dependencies must belong to the same project and organization');
  }
};

const validateDependencyCycles = async ({ taskId, organizationId, projectId, dependencies }) => {
  if (!taskId || !dependencies.length) return;
  const visited = new Set();
  const pending = [...dependencies.map(String)];
  while (pending.length) {
    const dependencyId = pending.pop();
    if (dependencyId === String(taskId)) throw new Error('Dependency cycle detected');
    if (visited.has(dependencyId)) continue;
    visited.add(dependencyId);
    const dependency = await Task.findOne({ _id: dependencyId, organizationId, projectId }).select('dependencies').lean();
    if (!dependency) throw new Error('Dependencies must belong to the same project and organization');
    pending.push(...(dependency.dependencies || []).map(String));
  }
};

const validateParentCycle = async ({ taskId, parentTaskId, organizationId, projectId }) => {
  if (!parentTaskId) return;
  if (taskId && String(taskId) === String(parentTaskId)) throw new Error('A task cannot be its own parent');
  const visited = new Set();
  let current = String(parentTaskId);
  while (current) {
    if (taskId && current === String(taskId)) throw new Error('Parent task cycle detected');
    if (visited.has(current)) throw new Error('Parent task cycle detected');
    visited.add(current);
    const parent = await Task.findOne({ _id: current, organizationId, projectId }).select('parentTaskId').lean();
    if (!parent) throw new Error('Parent task must belong to the same project and organization');
    current = parent.parentTaskId ? String(parent.parentTaskId) : null;
  }
};

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
    for (const [name, value] of Object.entries({ projectId: req.query.projectId, assignedTo: req.query.assignedTo, parentTaskId: req.query.parentTaskId === 'null' ? undefined : req.query.parentTaskId })) {
      if (value !== undefined && !isValidObjectId(value)) return res.status(400).json({ success: false, message: `${name} is invalid` });
    }
    const query = { organizationId: req.user.organizationId };

    // Filters
    if (req.query.projectId) query.projectId = req.query.projectId;
    if (req.query.assignedTo) query.assignedTo = { $in: [req.query.assignedTo] };
    if (req.query.status) query.status = req.query.status;
    if (req.query.priority) query.priority = req.query.priority;
    if (req.query.parentTaskId) {
      query.parentTaskId = req.query.parentTaskId === 'null' ? null : req.query.parentTaskId;
    }

    // Employees must never inherit task visibility from project membership.
    if (req.user.role === 'employee') {
       query.assignedTo = { $in: [req.user.id] };
    } else if (req.user.role === 'viewer') {
       if (!req.query.projectId) {
          const projects = await Project.find({ members: req.user.id, organizationId: req.user.organizationId }).select('_id');
          const projectIds = projects.map(p => p._id);
          query.$or = [{ assignedTo: { $in: [req.user.id] } }, { projectId: { $in: projectIds } }];
       }
    }

    // Pagination
    let pagination;
    try { pagination = parsePagination(req.query); } catch (error) { return res.status(400).json({ success: false, message: error.message }); }
    const { page, limit, skip: startIndex } = pagination;

    const total = await Task.countDocuments(query);

    const tasks = await Task.find(query)
      .populate('assignedTo', 'firstName lastName profileImage')
      .populate('reportingTo', 'firstName lastName profileImage')
      .populate('projectId', 'name projectCode')
      .populate('divisionId', 'name')
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
    if (req.user.role === 'employee' && !(task.assignedTo || []).some(user => String(user._id || user) === req.user.id)) {
      return res.status(403).json({ success: false, message: 'Not authorized to view this task' });
    }
    if (
      req.user.role !== 'organization_admin' &&
      project.managerId.toString() !== req.user.id &&
       !project.members.some(member => member.toString() === req.user.id)
    ) {
      return res.status(403).json({ success: false, message: 'Not authorized to view this task' });
    }

    const dependentTasks = await Task.find({
      organizationId: req.user.organizationId,
      projectId: task.projectId._id || task.projectId,
      dependencies: task._id,
    }).select('taskCode title status');
    res.status(200).json({ success: true, data: { ...task.toObject(), dependentTasks } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Create new task
// @route   POST /api/tasks
// @access  Private (OrgAdmin, ProjectManager, TeamLead, Employee)
const createTask = async (req, res) => {
  try {
    if (req.user.role === 'viewer') return res.status(403).json({ success: false, message: 'Viewers cannot create tasks' });
    const { projectId, assignedTo } = req.body;
    
    req.body.organizationId = req.user.organizationId;
    req.body.createdBy = req.user.id;

    // Validate project
    const project = await Project.findOne({
      _id: projectId,
      organizationId: req.user.organizationId,
    });

    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }

    const isMember = project.members.map(m => m.toString()).includes(req.user.id);
    const isManager = project.managerId.toString() === req.user.id;
    const isOrgAdmin = req.user.role === 'organization_admin';
    const isTeamLead = req.user.role === 'team_lead' && isMember;
    const isEmployee = req.user.role === 'employee';
    const isSubtask = !!req.body.parentTaskId;

    // Employees can create tasks only on projects they belong to
    if (isEmployee && !isMember) {
      return res.status(403).json({ success: false, message: 'Not authorized to create tasks in this project' });
    }
    if (!isOrgAdmin && !isManager && !isTeamLead && !isEmployee && !(isSubtask && isMember)) {
      return res.status(403).json({ success: false, message: 'Not authorized to create tasks in this project' });
    }

    // For employees: force assignedTo = self, force reportingTo = org admin
    let assignedToArray;
    if (isEmployee) {
      assignedToArray = [req.user.id];
      req.body.assignedTo = assignedToArray;
      req.body.assignedBy = req.user.id;

      // Auto-set reportingTo = organization admin
      const User = require('../models/User');
      const orgAdmin = await User.findOne({ organizationId: req.user.organizationId, role: 'organization_admin', isActive: true }).select('_id');
      if (orgAdmin) req.body.reportingTo = orgAdmin._id;
    } else {
      assignedToArray = Array.isArray(assignedTo) ? assignedTo : (assignedTo ? [assignedTo] : []);
      if (assignedTo) req.body.assignedBy = req.user.id;
    }

    try {
      const dependencies = [...new Set((req.body.dependencies || []).map(String))];
      await validateTaskRelations({ organizationId: req.user.organizationId, project, divisionId: req.body.divisionId, assignedTo: assignedToArray, parentTaskId: req.body.parentTaskId, dependencies });
      await validateParentCycle({ organizationId: req.user.organizationId, projectId: project._id, parentTaskId: req.body.parentTaskId });
      req.body.dependencies = dependencies;
    } catch (error) {
      return res.status(400).json({ success: false, message: error.message });
    }

    // For non-employee: validate all assignees belong to project
    if (!isEmployee) {
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
    }

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

    // Notify assignees (non-self)
    const notifyAssignees = assignedToArray.filter(uid => uid.toString() !== req.user.id);
    if (notifyAssignees.length > 0) {
      await notificationService.createMany(notifyAssignees.map(uid => ({
        organizationId: req.user.organizationId,
        userId: uid,
        type: 'task_assigned',
        title: 'New Task Assigned',
        message: `You have been assigned to task: ${task.taskCode}`,
        taskId: task._id,
        projectId: project._id,
      })));
    }

    // If created by employee, notify org admin
    if (isEmployee && req.body.reportingTo) {
      await notificationService.createMany([{
        organizationId: req.user.organizationId,
        userId: req.body.reportingTo,
        type: 'task_updated',
        title: 'New Task Created by Employee',
        message: `${req.user.firstName || 'An employee'} created a new task "${task.title}" (${task.taskCode}) in project ${project.name}`,
        taskId: task._id,
        projectId: project._id,
      }]);
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
    if (req.user.role === 'viewer') return res.status(403).json({ success: false, message: 'Viewers cannot update tasks' });
    delete req.body.organizationId;
    delete req.body.projectId; // Prevent moving tasks between projects easily
    delete req.body._id;
    delete req.body.createdBy;
    delete req.body.taskCode;
    delete req.body.assignedBy;
    delete req.body.actualHours;

    let task = await Task.findOne({
      _id: req.params.id,
      organizationId: req.user.organizationId,
    });

    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    // Access check: any assignee, manager, org_admin, or team_lead
    const project = await Project.findOne({ _id: task.projectId, organizationId: req.user.organizationId });
    if (!project) return res.status(404).json({ success: false, message: 'Task project not found' });
    const currentAssignees = (task.assignedTo || []).map(id => id.toString());
    const isAssignee = currentAssignees.includes(req.user.id);
    const isManager = project.managerId.toString() === req.user.id;
    const isOrgAdmin = req.user.role === 'organization_admin';
    const isTeamLead = req.user.role === 'team_lead' && project.members.some(member => member.toString() === req.user.id);

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

     try {
       const dependencies = [...new Set((req.body.dependencies === undefined ? (task.dependencies || []) : req.body.dependencies).map(String))];
       await validateTaskRelations({
         organizationId: req.user.organizationId,
        project,
        divisionId: req.body.divisionId === undefined ? task.divisionId : req.body.divisionId,
         assignedTo: req.body.assignedTo === undefined ? (task.assignedTo || []) : req.body.assignedTo,
         parentTaskId: req.body.parentTaskId === undefined ? task.parentTaskId : req.body.parentTaskId,
         dependencies,
       });
       await validateParentCycle({ taskId: task._id, organizationId: req.user.organizationId, projectId: project._id, parentTaskId: req.body.parentTaskId === undefined ? task.parentTaskId : req.body.parentTaskId });
       await validateDependencyCycles({ taskId: task._id, organizationId: req.user.organizationId, projectId: project._id, dependencies });
       req.body.dependencies = dependencies;
     } catch (error) {
       return res.status(400).json({ success: false, message: error.message });
     }
     if (Array.isArray(req.body.dependencies) && req.body.dependencies.some(id => String(id) === String(req.params.id))) {
       return res.status(400).json({ success: false, message: 'A task cannot depend on itself' });
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
      await notificationService.createMany(newAssignees.filter(uid => !oldAssignees.includes(uid.toString()) && uid.toString() !== req.user.id).map(uid => ({
            organizationId: req.user.organizationId,
            userId: uid,
            type: 'task_assigned',
            title: 'Task Assigned to You',
            message: `Task ${updatedTask.taskCode} has been assigned to you`,
            taskId: updatedTask._id,
            projectId: updatedTask.projectId,
          })));
    }

    const meaningfulChanges = ['status', 'priority', 'dueDate'].filter(field => changes[field]);
    if (meaningfulChanges.length) {
      const recipients = [...new Set((updatedTask.assignedTo || []).map(String).filter(uid => uid !== req.user.id))];
      if (recipients.length) {
        const changeText = meaningfulChanges.map(field => `${field} changed`).join(', ');
        try {
        await notificationService.createMany(recipients.map(uid => ({
            organizationId: req.user.organizationId,
            userId: uid,
            type: 'task_updated',
            title: 'Task updated',
            message: `${updatedTask.taskCode}: ${changeText}`,
            taskId: updatedTask._id,
            projectId: updatedTask.projectId,
        })));
        } catch (notificationError) { console.error('Task notification delivery failed', notificationError.message); }
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
    if (req.user.role === 'viewer' || req.user.role === 'employee') return res.status(403).json({ success: false, message: 'Not authorized to delete tasks' });
    const task = await Task.findOne({
      _id: req.params.id,
      organizationId: req.user.organizationId,
    });

    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    // Access check: only manager, org_admin or team_lead can delete
    const project = await Project.findOne({ _id: task.projectId, organizationId: req.user.organizationId });
    if (!project) return res.status(404).json({ success: false, message: 'Task project not found' });
    const isManager = project.managerId.toString() === req.user.id;
    const isOrgAdmin = req.user.role === 'organization_admin';
    const isTeamLead = req.user.role === 'team_lead' && project.members.some(member => member.toString() === req.user.id);

    if (!isManager && !isOrgAdmin && !isTeamLead) {
       return res.status(403).json({ success: false, message: 'Not authorized to delete this task' });
    }

    // Delete the task and all direct subtasks, removing every deleted ID from dependencies first.
    const subtasks = await Task.find({ parentTaskId: task._id, organizationId: req.user.organizationId }).select('_id');
    const deletedTaskIds = [task._id, ...subtasks.map(subtask => subtask._id)];
    await Task.updateMany({ organizationId: req.user.organizationId, dependencies: { $in: deletedTaskIds } }, { $pull: { dependencies: { $in: deletedTaskIds } } });
    await Task.deleteMany({ _id: { $in: deletedTaskIds }, organizationId: req.user.organizationId });
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
    if (req.user.role === 'viewer') return res.status(403).json({ success: false, message: 'Viewers cannot duplicate tasks' });
    const task = await Task.findOne({
      _id: req.params.id,
      organizationId: req.user.organizationId,
    });

    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }
    if (req.user.role === 'employee' && !(task.assignedTo || []).some(id => String(id) === req.user.id)) {
      return res.status(403).json({ success: false, message: 'Not authorized to duplicate this task' });
    }

    const project = await Project.findOne({ _id: task.projectId, organizationId: req.user.organizationId });
    if (!project) return res.status(404).json({ success: false, message: 'Task project not found' });
    if (
      req.user.role !== 'organization_admin' &&
      project.managerId.toString() !== req.user.id &&
       !project.members.some(member => member.toString() === req.user.id)
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
