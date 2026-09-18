const Task = require('../models/Task');
const Project = require('../models/Project');

// @desc    Get calendar events (tasks and project deadlines)
// @route   GET /api/calendar
// @access  Private
const getCalendarEvents = async (req, res) => {
  try {
    const orgId = req.user.organizationId;
    
    // Fetch projects
    let projectQuery = { organizationId: orgId, dueDate: { $exists: true, $ne: null } };
    if (req.user.role === 'employee' || req.user.role === 'viewer') {
       projectQuery.$or = [{ members: req.user.id }, { managerId: req.user.id }];
    }
    const projects = await Project.find(projectQuery).select('name projectCode dueDate status');

    // Fetch tasks
    let taskQuery = { organizationId: orgId, dueDate: { $exists: true, $ne: null } };
    if (req.user.role === 'employee' || req.user.role === 'viewer') {
       const userProjects = await Project.find({ members: req.user.id, organizationId: orgId }).select('_id');
       const projectIds = userProjects.map(p => p._id);
       taskQuery.$or = [{ assignedTo: req.user.id }, { projectId: { $in: projectIds } }];
    }
    const tasks = await Task.find(taskQuery).select('title taskCode dueDate status priority');

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

    res.status(200).json({ success: true, data: events });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getCalendarEvents,
};
