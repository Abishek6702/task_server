const mongoose = require('mongoose');
const Task = require('../models/Task');
const Project = require('../models/Project');
const User = require('../models/User');

const visibleScopes = async (req) => {
  if (!req.user.organizationId || req.user.role === 'super_admin') return null;
  const userId = new mongoose.Types.ObjectId(req.user.id);
  const orgId = new mongoose.Types.ObjectId(req.user.organizationId);
  const projectScope = { organizationId: orgId };
  const taskScope = { organizationId: orgId };
  if (req.user.role === 'employee') {
    projectScope.$or = [{ members: userId }, { managerId: userId }];
    taskScope.assignedTo = userId;
  } else if (req.user.role === 'viewer') {
    const projects = await Project.find({ organizationId: orgId, members: userId }).select('_id');
    projectScope.$or = [{ members: userId }, { managerId: userId }];
    taskScope.$or = [{ assignedTo: userId }, { projectId: { $in: projects.map(p => p._id) } }];
  } else if (['project_manager', 'team_lead'].includes(req.user.role)) {
    const projects = await Project.find({ organizationId: orgId, $or: [{ members: userId }, { managerId: userId }] }).select('_id');
    projectScope.$or = [{ members: userId }, { managerId: userId }];
    taskScope.projectId = { $in: projects.map(p => p._id) };
  }
  return { projectScope, taskScope };
};


const parseReportFilters = (query) => {
  const filters = {};
  if (query.projectId) {
    if (!mongoose.isValidObjectId(query.projectId)) throw new Error('projectId is invalid');
    filters.projectId = new mongoose.Types.ObjectId(query.projectId);
  }
  if (query.assigneeId) {
    if (!mongoose.isValidObjectId(query.assigneeId)) throw new Error('assigneeId is invalid');
    filters.assignedTo = new mongoose.Types.ObjectId(query.assigneeId);
  }
  if (query.status) filters.status = query.status;
  if (query.priority) filters.priority = query.priority;
  if (query.dateFrom || query.dateTo) {
    filters.dueDate = {};
    if (query.dateFrom) {
      const dateFrom = new Date(query.dateFrom);
      if (Number.isNaN(dateFrom.getTime())) throw new Error('dateFrom is invalid');
      filters.dueDate.$gte = dateFrom;
    }
    if (query.dateTo) {
      const dateTo = new Date(query.dateTo);
      if (Number.isNaN(dateTo.getTime())) throw new Error('dateTo is invalid');
      dateTo.setHours(23, 59, 59, 999);
      filters.dueDate.$lte = dateTo;
    }
  }
  return filters;
};

const getDashboardReports = async (req, res) => {
  try {
    const scopes = await visibleScopes(req);
    if (!scopes) return res.status(403).json({ success: false, message: 'Reports require an organization context' });
    const taskMatch = { ...scopes.taskScope, ...parseReportFilters(req.query) };
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [projectStats, taskStats, statusBreakdown, priorityBreakdown, taskTrend, projectProgress] = await Promise.all([
      Project.aggregate([{ $match: scopes.projectScope }, { $group: { _id: null, totalProjects: { $sum: 1 }, activeProjects: { $sum: { $cond: [{ $eq: ['$status', 'Active'] }, 1, 0] } } } }]),
      Task.aggregate([{ $match: taskMatch }, { $group: { _id: null, totalTasks: { $sum: 1 }, completedTasks: { $sum: { $cond: [{ $eq: ['$status', 'Done'] }, 1, 0] } }, overdueTasks: { $sum: { $cond: [{ $and: [{ $ne: ['$status', 'Done'] }, { $lt: ['$dueDate', today] }, { $ne: ['$dueDate', null] }] }, 1, 0] } } } }]),
      Task.aggregate([{ $match: taskMatch }, { $group: { _id: '$status', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
      Task.aggregate([{ $match: taskMatch }, { $group: { _id: '$priority', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
      Task.aggregate([{ $match: { ...taskMatch, createdAt: { $gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) } } }, { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
      Project.aggregate([{ $match: scopes.projectScope }, { $project: { _id: 1, name: 1, projectCode: 1, status: 1, progress: 1 } }, { $sort: { progress: -1, name: 1 } }, { $limit: 50 }]),
    ]);
    const projects = projectStats[0] || { totalProjects: 0, activeProjects: 0 };
    const tasks = taskStats[0] || { totalTasks: 0, completedTasks: 0, overdueTasks: 0 };
    res.status(200).json({ success: true, data: {
      totalProjects: projects.totalProjects,
      activeProjects: projects.activeProjects,
      totalTasks: tasks.totalTasks,
      completedTasks: tasks.completedTasks,
      overdueTasks: tasks.overdueTasks,
      openTasks: tasks.totalTasks - tasks.completedTasks,
      statusBreakdown,
      priorityBreakdown,
      taskTrend,
      projectProgress,
    } });
  } catch (error) {
    res.status(/invalid/.test(error.message) ? 400 : 500).json({ success: false, message: error.message });
  }
};

const getWorkloadReport = async (req, res) => {
  try {
    if (!['organization_admin', 'project_manager', 'team_lead'].includes(req.user.role)) return res.status(403).json({ success: false, message: 'Not authorized to view workload reports' });
    const scopes = await visibleScopes(req);
    if (!scopes) return res.status(403).json({ success: false, message: 'Reports require an organization context' });
    const taskMatch = { ...scopes.taskScope, ...parseReportFilters(req.query) };
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const data = await Task.aggregate([
      { $match: taskMatch },
      { $unwind: { path: '$assignedTo', preserveNullAndEmptyArrays: false } },
      { $group: { _id: '$assignedTo', totalTaskCount: { $sum: 1 }, taskCount: { $sum: { $cond: [{ $ne: ['$status', 'Done'] }, 1, 0] } }, completedTaskCount: { $sum: { $cond: [{ $eq: ['$status', 'Done'] }, 1, 0] } }, overdueTaskCount: { $sum: { $cond: [{ $and: [{ $ne: ['$status', 'Done'] }, { $lt: ['$dueDate', today] }, { $ne: ['$dueDate', null] }] }, 1, 0] } } } },
      { $lookup: { from: User.collection.name, localField: '_id', foreignField: '_id', as: 'user' } },
      { $unwind: '$user' },
      { $match: { 'user.organizationId': req.user.organizationId, 'user.isActive': true } },
      { $project: { _id: 1, taskCount: 1, totalTaskCount: 1, completedTaskCount: 1, overdueTaskCount: 1, user: { _id: 1, firstName: 1, lastName: 1, role: 1, profileImage: 1 } } },
      { $sort: { taskCount: -1, 'user.lastName': 1 } },
    ]);
    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(/invalid/.test(error.message) ? 400 : 500).json({ success: false, message: error.message });
  }
};

module.exports = { getDashboardReports, getWorkloadReport };
