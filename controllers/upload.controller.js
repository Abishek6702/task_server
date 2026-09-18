const Task = require('../models/Task');
const Comment = require('../models/Comment');

const uploadAttachment = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Please upload a file' });
    }

    const { entityType, entityId } = req.body;
    
    if (!entityType || !entityId) {
      return res.status(400).json({ success: false, message: 'Entity type and ID are required' });
    }

    const attachment = {
      originalName: req.file.originalname,
      fileName: req.file.filename,
      mimeType: req.file.mimetype,
      size: req.file.size,
      path: `/${req.file.path.replace(/\\/g, '/')}`,
      uploadedBy: req.user.id,
    };

    if (entityType === 'task') {
       const task = await Task.findOneAndUpdate(
         { _id: entityId, organizationId: req.user.organizationId },
         { $push: { attachments: attachment } },
         { new: true }
       );
       if (!task) return res.status(404).json({ success: false, message: 'Task not found' });
    } else if (entityType === 'comment') {
       const comment = await Comment.findOneAndUpdate(
         { _id: entityId, organizationId: req.user.organizationId },
         { $push: { attachments: attachment } },
         { new: true }
       );
       if (!comment) return res.status(404).json({ success: false, message: 'Comment not found' });
    } else {
       return res.status(400).json({ success: false, message: 'Invalid entity type' });
    }

    res.status(200).json({ success: true, data: attachment });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  uploadAttachment,
};
