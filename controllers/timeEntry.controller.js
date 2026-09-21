const TimeEntry = require('../models/TimeEntry');
const Task = require('../models/Task');
const Project = require('../models/Project');
const User = require('../models/User');
const { isValidObjectId, parsePagination } = require('../utils/validation');

const getTaskContext = async (taskId, organizationId) => {
  if (!isValidObjectId(taskId)) return null;
  const task = await Task.findOne({ _id: taskId, organizationId }).select('projectId assignedTo createdBy');
  if (!task) return null;
  const project = await Project.findOne({ _id: task.projectId, organizationId }).select('managerId members');
  return project ? { task, project } : null;
};

const canView = (req, context) => req.user.role === 'organization_admin' || String(context.project.managerId) === req.user.id || (req.user.role === 'employee' ? context.task.assignedTo.some(id => String(id) === req.user.id) : context.project.members.some(id => String(id) === req.user.id) || String(context.task.createdBy) === req.user.id);

const refreshActualHours = async (taskId, organizationId) => {
  const [result] = await TimeEntry.aggregate([{ $match: { taskId, organizationId, durationMinutes: { $gt: 0 } } }, { $group: { _id: null, minutes: { $sum: '$durationMinutes' } } }]);
  await Task.updateOne({ _id: taskId, organizationId }, { actualHours: result ? Math.round((result.minutes / 60) * 100) / 100 : 0 });
};

const createEntry = async (req, res) => {
  try {
    const { taskId, startTime, durationMinutes, notes } = req.body;
    const context = await getTaskContext(taskId, req.user.organizationId);
    if (!context) return res.status(404).json({ success: false, message: 'Task not found' });
    if (!canView(req, context) || req.user.role === 'viewer') return res.status(403).json({ success: false, message: 'Not authorized to record time' });
    const duration = Number(durationMinutes);
    const start = startTime ? new Date(startTime) : new Date();
    if (!Number.isFinite(duration) || duration <= 0 || duration > 1440 || Number.isNaN(start.getTime())) return res.status(400).json({ success: false, message: 'Valid duration and start time are required' });
    const entry = await TimeEntry.create({ organizationId: req.user.organizationId, taskId, projectId: context.task.projectId, userId: req.user.id, startTime: start, endTime: new Date(start.getTime() + duration * 60000), durationMinutes: duration, notes });
    await refreshActualHours(taskId, req.user.organizationId);
    res.status(201).json({ success: true, data: entry });
  } catch (error) { res.status(500).json({ success: false, message: 'Failed to record time' }); }
};

const startTimer = async (req, res) => {
  try {
    const context = await getTaskContext(req.body.taskId, req.user.organizationId);
    if (!context) return res.status(404).json({ success: false, message: 'Task not found' });
    if (!canView(req, context) || req.user.role === 'viewer') return res.status(403).json({ success: false, message: 'Not authorized to track time' });
    const active = await TimeEntry.findOne({ organizationId: req.user.organizationId, userId: req.user.id, endTime: null });
    if (active) return res.status(400).json({ success: false, message: 'Stop your active timer before starting another' });
    let entry;
    try {
      entry = await TimeEntry.create({ organizationId: req.user.organizationId, taskId: context.task._id, projectId: context.task.projectId, userId: req.user.id, startTime: new Date() });
    } catch (error) {
      if (error.code === 11000) return res.status(409).json({ success: false, message: 'Stop your active timer before starting another' });
      throw error;
    }
    res.status(201).json({ success: true, data: entry });
  } catch (error) { res.status(500).json({ success: false, message: 'Failed to start timer' }); }
};

const stopTimer = async (req, res) => {
  try {
    const entry = await TimeEntry.findOne({ _id: req.params.id, organizationId: req.user.organizationId, userId: req.user.id, endTime: null });
    if (!entry) return res.status(404).json({ success: false, message: 'Active timer not found' });
    entry.endTime = new Date();
    entry.durationMinutes = Math.max(1, Math.round((entry.endTime - entry.startTime) / 60000));
    await entry.save();
    await refreshActualHours(entry.taskId, req.user.organizationId);
    res.status(200).json({ success: true, data: entry });
  } catch (error) { res.status(500).json({ success: false, message: 'Failed to stop timer' }); }
};

const listTaskEntries = async (req, res) => {
  try {
    const context = await getTaskContext(req.params.taskId, req.user.organizationId);
    if (!context) return res.status(404).json({ success: false, message: 'Task not found' });
    if (!canView(req, context)) return res.status(403).json({ success: false, message: 'Not authorized to view time entries' });
    const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 20 });
    const query = { organizationId: req.user.organizationId, taskId: context.task._id };
    const [total, entries] = await Promise.all([TimeEntry.countDocuments(query), TimeEntry.find(query).populate('userId', 'firstName lastName').sort('-startTime').skip(skip).limit(limit)]);
    res.json({ success: true, count: entries.length, pagination: { page, limit, total, totalPages: Math.ceil(total / limit), pages: Math.ceil(total / limit) }, data: entries });
  } catch (error) { res.status(400).json({ success: false, message: error.message }); }
};

const listMyEntries = async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 20 });
  const query = { organizationId: req.user.organizationId, userId: req.user.id };
  const [total, entries] = await Promise.all([TimeEntry.countDocuments(query), TimeEntry.find(query).populate('taskId', 'title taskCode').sort('-startTime').skip(skip).limit(limit)]);
  res.json({ success: true, count: entries.length, pagination: { page, limit, total, totalPages: Math.ceil(total / limit), pages: Math.ceil(total / limit) }, data: entries });
};

const updateEntry = async (req, res) => {
  try {
    if (req.user.role === 'viewer') return res.status(403).json({ success: false, message: 'Viewers cannot modify time entries' });
    const entry = await TimeEntry.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
    if (!entry) return res.status(404).json({ success: false, message: 'Time entry not found' });
    const context = await getTaskContext(entry.taskId, req.user.organizationId);
    const authorized = String(entry.userId) === req.user.id || req.user.role === 'organization_admin' || (context && String(context.project.managerId) === req.user.id);
    if (!authorized) return res.status(403).json({ success: false, message: 'Not authorized to update this time entry' });
    if (req.body.taskId || req.body.projectId || req.body.userId || req.body.organizationId) return res.status(400).json({ success: false, message: 'Time entry ownership fields cannot be changed' });
    if (req.body.durationMinutes !== undefined) {
      const duration = Number(req.body.durationMinutes);
      if (!Number.isFinite(duration) || duration <= 0 || duration > 1440 || !entry.endTime) return res.status(400).json({ success: false, message: 'Only completed entries can have a valid duration update' });
      entry.durationMinutes = duration;
      entry.endTime = new Date(entry.startTime.getTime() + duration * 60000);
    }
    if (req.body.notes !== undefined) entry.notes = req.body.notes;
    await entry.save();
    await refreshActualHours(entry.taskId, req.user.organizationId);
    res.json({ success: true, data: entry });
  } catch (error) { res.status(500).json({ success: false, message: 'Failed to update time entry' }); }
};

const deleteEntry = async (req, res) => {
  try {
    if (req.user.role === 'viewer') return res.status(403).json({ success: false, message: 'Viewers cannot delete time entries' });
    const entry = await TimeEntry.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
    if (!entry) return res.status(404).json({ success: false, message: 'Time entry not found' });
    const context = await getTaskContext(entry.taskId, req.user.organizationId);
    const authorized = String(entry.userId) === req.user.id || req.user.role === 'organization_admin' || (context && String(context.project.managerId) === req.user.id);
    if (!authorized) return res.status(403).json({ success: false, message: 'Not authorized to delete this time entry' });
    await entry.deleteOne();
    await refreshActualHours(entry.taskId, req.user.organizationId);
    res.json({ success: true, data: {} });
  } catch (error) { res.status(500).json({ success: false, message: 'Failed to delete time entry' }); }
};

module.exports = { createEntry, startTimer, stopTimer, listTaskEntries, listMyEntries, updateEntry, deleteEntry };
