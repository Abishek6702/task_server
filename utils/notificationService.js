const Notification = require('../models/Notification');

const createMany = async (notifications = []) => {
  const unique = new Map();
  for (const notification of notifications) {
    if (!notification.organizationId || !notification.userId || !notification.type) continue;
    const key = [notification.organizationId, notification.userId, notification.type, notification.taskId || '', notification.projectId || ''].join(':');
    if (!unique.has(key)) unique.set(key, notification);
  }
  if (!unique.size) return [];
  try {
    return await Notification.insertMany([...unique.values()]);
  } catch (error) {
    console.error('Notification delivery failed', error.message);
    return [];
  }
};

const create = (notification) => createMany([notification]);

module.exports = { create, createMany };
