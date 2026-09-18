const Task = require('../models/Task');
const Project = require('../models/Project');
const mongoose = require('mongoose');

// @desc    Get dashboard reports
// @route   GET /api/reports/dashboard
// @access  Private
const getDashboardReports = async (req, res) => {
  try {
    const orgId = req.user.organizationId;
    const userId = req.user.id;
    const role = req.user.role;

    // Get active projects
    let projectQuery = { organizationId: orgId, status: 'Active' };
    if (role === 'employee' || role === 'viewer') {
       projectQuery.$or = [{ members: userId }, { managerId: userId }];
    } else if (role === 'team_lead' || role === 'project_manager') {
       projectQuery.$or = [{ members: userId }, { managerId: userId }];
    }
    
    const activeProjects = await Project.countDocuments(projectQuery);

    // Get tasks
    let taskQuery = { organizationId: orgId };
    if (role === 'employee' || role === 'viewer') {
      const projects = await Project.find({ members: userId, organizationId: orgId }).select('_id');
      const projectIds = projects.map(p => p._id);
      taskQuery.$or = [{ assignedTo: userId }, { projectId: { $in: projectIds } }];
    }

    const allTasks = await Task.find(taskQuery).select('status priority dueDate assignedTo progress');
    
    const totalTasks = allTasks.length;
    const completedTasks = allTasks.filter(t => t.status === 'Done').length;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const overdueTasks = allTasks.filter(t => t.dueDate && new Date(t.dueDate) < today && t.status !== 'Done').length;
    const openTasks = totalTasks - completedTasks;

    res.status(200).json({
      success: true,
      data: {
        activeProjects,
        totalTasks,
        completedTasks,
        overdueTasks,
        openTasks,
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get workload report
// @route   GET /api/reports/workload
// @access  Private
const getWorkloadReport = async (req, res) => {
  try {
     const tasks = await Task.aggregate([
       { $match: { 
           organizationId: new mongoose.Types.ObjectId(req.user.organizationId), 
           status: { $ne: 'Done' } 
       }},
       { $group: { _id: '$assignedTo', taskCount: { $sum: 1 } } },
       { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
       { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
       { $project: { _id: 1, taskCount: 1, 'user.firstName': 1, 'user.lastName': 1, 'user.role': 1, 'user.profileImage': 1 } }
     ]);
     
     // Filter out null users (unassigned)
     const data = tasks.filter(t => t.user);
     
     res.status(200).json({ success: true, data });
  } catch (error) {
     res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getDashboardReports,
  getWorkloadReport,
};
