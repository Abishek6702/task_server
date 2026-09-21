const Task = require('../models/Task');
const Project = require('../models/Project');

const parseDateRange = (query) => {
  if (query.start === undefined && query.end === undefined) {
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));
    return { start, end };
  }
  if (typeof query.start !== 'string' || typeof query.end !== 'string') {
    throw new Error('start and end dates are required in YYYY-MM-DD format');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(query.start) || !/^\d{4}-\d{2}-\d{2}$/.test(query.end)) {
    throw new Error('Dates must use YYYY-MM-DD format');
  }
  const start = new Date(`${query.start}T00:00:00.000Z`);
  const end = new Date(`${query.end}T23:59:59.999Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
    throw new Error('Invalid date range');
  }
  const maxRange = 366 * 24 * 60 * 60 * 1000;
  if (end.getTime() - start.getTime() > maxRange) throw new Error('Date range cannot exceed 366 days');
  return { start, end };
};

// @desc    Get calendar events (tasks and project deadlines)
// @route   GET /api/calendar
// @access  Private
const getCalendarEvents = async (req, res) => {
  try {
    const orgId = req.user.organizationId;
    let range;
    try { range = parseDateRange(req.query); } catch (error) {
      return res.status(400).json({ success: false, message: error.message });
    }
    const dueDate = { $gte: range.start, $lte: range.end };

    // Build project query
    let projectQuery = { organizationId: orgId, dueDate };
    // Build task query
    let taskQuery = { organizationId: orgId, dueDate };

    if (req.user.role === 'employee') {
      // Employees only see projects they are members of and tasks assigned to them
      projectQuery.$or = [{ members: req.user.id }, { managerId: req.user.id }];
      taskQuery.assignedTo = req.user.id;
    } else if (req.user.role === 'viewer') {
      projectQuery.$or = [{ members: req.user.id }, { managerId: req.user.id }];
      const userProjects = await Project.find({ members: req.user.id, organizationId: orgId }).select('_id');
      taskQuery.$or = [{ assignedTo: req.user.id }, { projectId: { $in: userProjects.map(p => p._id) } }];
    } else if (req.user.role === 'project_manager' || req.user.role === 'team_lead') {
      projectQuery.$or = [{ members: req.user.id }, { managerId: req.user.id }];
      const userProjects = await Project.find({ organizationId: orgId, $or: [{ members: req.user.id }, { managerId: req.user.id }] }).select('_id');
      taskQuery.projectId = { $in: userProjects.map(p => p._id) };
    }
    // organization_admin sees all — no extra filter needed

    const [projects, tasks] = await Promise.all([
      Project.find(projectQuery).select('name projectCode dueDate status'),
      Task.find(taskQuery).select('title taskCode dueDate status priority'),
    ]);

    const events = [
      ...projects.map(p => ({
        id: p._id,
        title: `Project Deadline: ${p.name}`,
        date: p.dueDate,
        type: 'project',
        status: p.status,
        code: p.projectCode
      })),
      ...tasks.map(t => ({
        id: t._id,
        title: t.title,
        date: t.dueDate,
        type: 'task',
        status: t.status,
        priority: t.priority,
        code: t.taskCode
      }))
    ];

    res.status(200).json({ success: true, data: events, range: { start: req.query.start, end: req.query.end } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load calendar events' });
  }
};


module.exports = {
  getCalendarEvents,
};
