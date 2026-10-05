const Task = require('../models/Task');
const Project = require('../models/Project');
const User = require('../models/User');
const { parsePagination } = require('../utils/validation');

const globalSearch = async (req, res) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (!q) {
      return res.status(200).json({ success: true, data: [], pagination: {} });
    }
    if (q.length > 100) return res.status(400).json({ success: false, message: 'Search query is too long' });

    const orgId = req.user.organizationId;
    const userId = req.user.id;
    const role = req.user.role;
    const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 5, maxLimit: 20 });

    // Projects
    let projectQuery = { organizationId: orgId, $or: [{ name: regex }, { projectCode: regex }] };
     if (role === 'employee' || role === 'viewer') {
       projectQuery.$or = [
         { name: regex, members: userId },
         { projectCode: regex, members: userId },
         { name: regex, managerId: userId },
         { projectCode: regex, managerId: userId }
       ];
    }
    const [projectTotal, projects] = await Promise.all([
      Project.countDocuments(projectQuery),
      Project.find(projectQuery).select('_id name projectCode status').skip(skip).limit(limit),
    ]);

    // Tasks
    let taskQuery = { organizationId: orgId, $or: [{ title: regex }, { taskCode: regex }] };
    if (role === 'employee' || role === 'viewer') {
       const userProjects = await Project.find({ members: userId, organizationId: orgId }).select('_id');
       const projectIds = userProjects.map(p => p._id);
       taskQuery.$or = [
         { title: regex, assignedTo: userId },
         { taskCode: regex, assignedTo: userId },
         { title: regex, projectId: { $in: projectIds } },
         { taskCode: regex, projectId: { $in: projectIds } }
       ];
    }
    const [taskTotal, tasks] = await Promise.all([
      Task.countDocuments(taskQuery),
      Task.find(taskQuery).select('_id title taskCode status projectId').skip(skip).limit(limit),
    ]);

    // Users
    let users = [];
    if (role === 'organization_admin' || role === 'super_admin' || role === 'project_manager') {
       const userQuery = { 
         organizationId: orgId, 
         $or: [{ firstName: regex }, { lastName: regex }, { email: regex }] 
       };
       const [userTotal, userResults] = await Promise.all([
         User.countDocuments(userQuery),
         User.find(userQuery).select('_id firstName lastName email role').skip(skip).limit(limit),
       ]);
       users = userResults;
       req.searchUserTotal = userTotal;
    }

    const results = [
      ...projects.map(p => ({ id: p._id, type: 'project', title: p.name, subtitle: p.projectCode, status: p.status })),
      ...tasks.map(t => ({ id: t._id, type: 'task', title: t.title, subtitle: t.taskCode, status: t.status })),
      ...users.map(u => ({ id: u._id, type: 'user', title: `${u.firstName} ${u.lastName}`, subtitle: u.email, status: u.role }))
    ];

    res.status(200).json({ success: true, pagination: {
      page, limit,
      projects: { total: projectTotal, totalPages: Math.ceil(projectTotal / limit) },
      tasks: { total: taskTotal, totalPages: Math.ceil(taskTotal / limit) },
      users: { total: req.searchUserTotal || 0, totalPages: Math.ceil((req.searchUserTotal || 0) / limit) },
    }, data: results });
  } catch (error) {
    if (/Page|Limit/.test(error.message)) return res.status(400).json({ success: false, message: error.message });
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  globalSearch,
};
