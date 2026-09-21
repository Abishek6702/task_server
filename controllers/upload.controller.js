const fs = require('fs/promises');
const path = require('path');
const Task = require('../models/Task');
const Comment = require('../models/Comment');
const Project = require('../models/Project');
const mongoose = require('mongoose');
const { remove, resolveKey } = require('../utils/storage');

const canAccessTask = (user, task, project) => {
  if (user.role === 'organization_admin') return true;
  if (project.managerId.toString() === user.id) return true;
  if (user.role === 'employee') return (task.assignedTo || []).some(assignee => assignee.toString() === user.id);
  if (project.members.some(member => member.toString() === user.id)) return true;
  return (task.assignedTo || []).some(assignee => assignee.toString() === user.id);
};

const canUpload = (user) => user.role !== 'viewer';

const hasValidSignature = async (file) => {
  const header = await fs.readFile(file.path, { encoding: null }).then(buffer => buffer.subarray(0, 8));
  const extension = path.extname(file.originalname).toLowerCase();
  if (extension === '.jpg' || extension === '.jpeg') return header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
  if (extension === '.png') return header.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (extension === '.pdf') return header.subarray(0, 5).toString() === '%PDF-';
  if (['.doc', '.xls'].includes(extension)) return header.subarray(0, 4).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0]));
  if (['.docx', '.xlsx'].includes(extension)) return header[0] === 0x50 && header[1] === 0x4b;
  return true;
};

const getAuthorizedOwner = async (req, entityType, entityId) => {
  if (entityType === 'task') {
    const task = await Task.findOne({ _id: entityId, organizationId: req.user.organizationId });
    if (!task) return null;
    const project = await Project.findOne({ _id: task.projectId, organizationId: req.user.organizationId });
    if (!project || !canAccessTask(req.user, task, project)) return false;
    return { type: 'task', resource: task, project };
  }
  if (entityType === 'comment') {
    const comment = await Comment.findOne({ _id: entityId, organizationId: req.user.organizationId });
    if (!comment) return null;
    const task = await Task.findOne({ _id: comment.taskId, organizationId: req.user.organizationId });
    const project = task && await Project.findOne({ _id: task.projectId, organizationId: req.user.organizationId });
    if (!task || !project || !canAccessTask(req.user, task, project)) return false;
    return { type: 'comment', resource: comment, task, project };
  }
  return null;
};

const uploadAttachment = async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'Please upload a file' });
  try {
    if (!canUpload(req.user)) {
      await remove(req.file.filename);
      return res.status(403).json({ success: false, message: 'Viewers cannot upload attachments' });
    }
    const { entityType, entityId } = req.body;
    if (!entityType || !entityId) {
      await remove(req.file.filename);
      return res.status(400).json({ success: false, message: 'Entity type and ID are required' });
    }
    if (!mongoose.isValidObjectId(entityId)) {
      await remove(req.file.filename);
      return res.status(400).json({ success: false, message: 'Entity ID is invalid' });
    }
    const owner = await getAuthorizedOwner(req, entityType, entityId);
    if (owner === false) {
      await remove(req.file.filename);
      return res.status(403).json({ success: false, message: 'Not authorized to attach a file here' });
    }
    if (!owner) {
      await remove(req.file.filename);
      return res.status(404).json({ success: false, message: `${entityType} not found` });
    }
    if (!(await hasValidSignature(req.file))) {
      await remove(req.file.filename);
      return res.status(400).json({ success: false, message: 'File content does not match its type' });
    }

    const attachment = {
      originalName: req.file.originalname,
      fileName: req.file.filename,
      mimeType: req.file.mimetype,
      size: req.file.size,
      path: req.file.filename,
      uploadedBy: req.user.id,
    };
    try {
      const Model = owner.type === 'task' ? Task : Comment;
      await Model.findByIdAndUpdate(owner.resource._id, { $push: { attachments: attachment } });
    } catch (error) {
      await remove(req.file.filename);
      throw error;
    }
    res.status(201).json({ success: true, message: 'Attachment uploaded', data: attachment });
  } catch (error) {
    if (req.file?.filename) await remove(req.file.filename).catch(() => {});
    res.status(500).json({ success: false, message: 'Attachment upload failed' });
  }
};

const findAttachment = async (req, fileName) => {
  const task = await Task.findOne({ organizationId: req.user.organizationId, 'attachments.fileName': fileName });
  if (task) {
    const project = await Project.findOne({ _id: task.projectId, organizationId: req.user.organizationId });
    if (!project || !canAccessTask(req.user, task, project)) return false;
    return { attachment: task.attachments.find(item => item.fileName === fileName), task, project };
  }
  const comment = await Comment.findOne({ organizationId: req.user.organizationId, 'attachments.fileName': fileName });
  if (!comment) return null;
  const taskForComment = await Task.findOne({ _id: comment.taskId, organizationId: req.user.organizationId });
  const project = taskForComment && await Project.findOne({ _id: taskForComment.projectId, organizationId: req.user.organizationId });
  if (!taskForComment || !project || !canAccessTask(req.user, taskForComment, project)) return false;
  return { attachment: comment.attachments.find(item => item.fileName === fileName), comment, task: taskForComment, project };
};

const downloadAttachment = async (req, res) => {
  try {
    const found = await findAttachment(req, req.params.fileName);
    if (found === false || !found) return res.status(404).json({ success: false, message: 'Attachment not found' });
    const filePath = resolveKey(found.attachment.fileName);
    res.set({ 'Content-Type': found.attachment.mimeType, 'Content-Disposition': `attachment; filename="${encodeURIComponent(found.attachment.originalName)}"`, 'X-Content-Type-Options': 'nosniff' });
    return res.sendFile(filePath, error => {
      if (error && !res.headersSent) res.status(404).json({ success: false, message: 'Attachment not found' });
    });
  } catch (error) {
    return res.status(404).json({ success: false, message: 'Attachment not found' });
  }
};

const deleteAttachment = async (req, res) => {
  try {
    if (req.user.role === 'viewer') return res.status(403).json({ success: false, message: 'Viewers cannot delete attachments' });
    const found = await findAttachment(req, req.params.fileName);
    if (found === false || !found) return res.status(404).json({ success: false, message: 'Attachment not found' });
    const canDelete = req.user.role === 'organization_admin' || found.project.managerId.toString() === req.user.id || found.attachment.uploadedBy?.toString() === req.user.id;
    if (!canDelete) return res.status(403).json({ success: false, message: 'Not authorized to delete this attachment' });
    const Model = found.task && !found.comment ? Task : Comment;
    await Model.updateOne({ _id: (found.task || found.comment)._id, organizationId: req.user.organizationId }, { $pull: { attachments: { fileName: req.params.fileName } } });
    await remove(req.params.fileName).catch(error => console.error('Attachment file deletion failed:', error.message));
    return res.status(200).json({ success: true, message: 'Attachment deleted' });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Attachment deletion failed' });
  }
};

module.exports = { uploadAttachment, downloadAttachment, deleteAttachment };
