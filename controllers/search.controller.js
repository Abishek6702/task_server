const Task = require('../models/Task');
const Project = require('../models/Project');
const User = require('../models/User');

const globalSearch = async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim() === '') {
      return res.status(200).json({ success: true, data: [] });
    }

    const orgId = req.user.organizationId;
    const userId = req.user.id;
    const role = req.user.role;
    const regex = new RegExp(q, 'i');

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
    const projects = await Project.find(projectQuery).select('_id name projectCode status').limit(5);

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
    const tasks = await Task.find(taskQuery).select('_id title taskCode status projectId').limit(5);

    // Users
    let users = [];
    if (role === 'organization_admin' || role === 'super_admin' || role === 'project_manager') {
       users = await User.find({ 
         organizationId: orgId, 
         $or: [{ firstName: regex }, { lastName: regex }, { email: regex }] 
       }).select('_id firstName lastName email role').limit(5);
    }

    const results = [
      ...projects.map(p => ({ id: p._id, type: 'project', title: p.name, subtitle: p.projectCode, status: p.status })),
      ...tasks.map(t => ({ id: t._id, type: 'task', title: t.title, subtitle: t.taskCode, status: t.status })),
      ...users.map(u => ({ id: u._id, type: 'user', title: `${u.firstName} ${u.lastName}`, subtitle: u.email, status: u.role }))
    ];

    res.status(200).json({ success: true, data: results });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  globalSearch,
};
