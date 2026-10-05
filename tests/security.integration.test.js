const request = require('supertest');
const mongoose = require('mongoose');
const path = require('path');
process.env.MONGOMS_DOWNLOAD_DIR = path.join(__dirname, '..', '.mongodb-binaries');
process.env.MONGOMS_PREFER_GLOBAL_PATH = 'false';
const { MongoMemoryReplSet } = require('mongodb-memory-server');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'phase-2-test-secret';
process.env.JWT_EXPIRES_IN = '1h';
process.env.CLIENT_URL = 'http://localhost:5173';

const { app } = require('../server');
jest.setTimeout(600000);
const Organization = require('../models/Organization');
const User = require('../models/User');
const Project = require('../models/Project');
const Task = require('../models/Task');
const Comment = require('../models/Comment');
const Notification = require('../models/Notification');
const ActivityLog = require('../models/ActivityLog');
const { generateToken } = require('../utils/jwt');

let mongo;
let orgA;
let orgB;
let usersA;
let usersB;
let projectA;
let projectB;
let taskA;
let taskB;
let commentB;
let notificationB;
let activityB;
let databaseSetupError;

const password = 'Password123!';

const createOrganization = (code, email) => Organization.create({
  name: `${code} Organization`, code, email,
});

const createRoleUsers = async (organizationId, prefix) => {
  const roles = ['organization_admin', 'project_manager', 'team_lead', 'employee', 'viewer'];
  const users = {};
  for (const role of roles) {
    users[role] = await User.create({
      firstName: role,
      lastName: prefix,
      email: `${role}.${prefix.toLowerCase()}@example.com`,
      password,
      organizationId,
      role,
    });
  }
  return users;
};

const tokenFor = (user) => generateToken(user._id, user.role, user.organizationId);
const auth = (user) => ({ Authorization: `Bearer ${tokenFor(user)}` });

beforeAll(async () => {
  try {
    if (process.env.TEST_MONGODB_URI) {
      await mongoose.connect(process.env.TEST_MONGODB_URI);
    } else {
      mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
      await mongoose.connect(mongo.getUri());
    }
  } catch (error) {
    databaseSetupError = error;
    throw new Error(`Isolated MongoDB could not start: ${error.message}`);
  }
});

afterEach(async () => {
  if (databaseSetupError || mongoose.connection.readyState !== 1) return;
  await Promise.all(Object.values(mongoose.connection.collections).map(collection => collection.deleteMany({})));
});

afterAll(async () => {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

beforeEach(async () => {
  orgA = await createOrganization('ORGA', 'org-a@example.com');
  orgB = await createOrganization('ORGB', 'org-b@example.com');
  usersA = await createRoleUsers(orgA._id, 'A');
  usersB = await createRoleUsers(orgB._id, 'B');

  projectA = await Project.create({
    name: 'Project A', projectCode: 'PA', organizationId: orgA._id,
    managerId: usersA.project_manager._id, members: [usersA.team_lead._id, usersA.employee._id],
    createdBy: usersA.organization_admin._id,
  });
  projectB = await Project.create({
    name: 'Project B', projectCode: 'PB', organizationId: orgB._id,
    managerId: usersB.project_manager._id, members: [usersB.team_lead._id, usersB.employee._id],
    createdBy: usersB.organization_admin._id,
  });
  taskA = await Task.create({
    taskCode: 'PA-1', title: 'Task A', organizationId: orgA._id, projectId: projectA._id,
    assignedTo: [usersA.employee._id], createdBy: usersA.organization_admin._id,
  });
  taskB = await Task.create({
    taskCode: 'PB-1', title: 'Task B', organizationId: orgB._id, projectId: projectB._id,
    assignedTo: [usersB.employee._id], createdBy: usersB.organization_admin._id,
  });
  commentB = await Comment.create({ organizationId: orgB._id, taskId: taskB._id, userId: usersB.employee._id, message: 'B comment' });
  notificationB = await Notification.create({ organizationId: orgB._id, userId: usersB.employee._id, type: 'general', title: 'B', message: 'B notification' });
  activityB = await ActivityLog.create({ organizationId: orgB._id, userId: usersB.employee._id, entityType: 'task', entityId: taskB._id, action: 'created' });
});

describe('authentication and registration', () => {
  test('logs in and serves /me without exposing password', async () => {
    const response = await request(app).post('/api/auth/login').send({ email: usersA.employee.email, password });
    expect(response.status).toBe(200);
    expect(response.body.token).toBeTruthy();
    expect(response.body.user.password).toBeUndefined();

    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${response.body.token}`);
    expect(me.status).toBe(200);
    expect(me.body.data.email).toBe(usersA.employee.email);
  });

  test('rejects invalid credentials and protected requests without a token', async () => {
    expect((await request(app).post('/api/auth/login').send({ email: usersA.employee.email, password: 'wrong' })).status).toBe(401);
    expect((await request(app).get('/api/projects')).status).toBe(401);
    expect((await request(app).get('/api/projects').set('Authorization', 'Bearer malformed')).status).toBe(401);
  });

  test('registers a normalized organization and admin transactionally', async () => {
    const response = await request(app).post('/api/auth/register').send({
      companyName: 'New Company', organizationCode: ' newco ', organizationEmail: 'ORG@Example.COM',
      firstName: 'New', lastName: 'Admin', email: 'ADMIN@Example.COM', password,
    });
    expect(response.status).toBe(201);
    const organization = await Organization.findOne({ code: 'NEWCO' });
    const user = await User.findOne({ email: 'admin@example.com' }).select('+password');
    expect(organization.email).toBe('org@example.com');
    expect(user.organizationId.toString()).toBe(organization._id.toString());
    expect(user.password).not.toBe(password);
  });

  test.each([
    ['duplicate organization code', { organizationCode: 'ORGA' }, 409],
    ['invalid organization code', { organizationCode: 'bad code!' }, 400],
    ['invalid email', { organizationCode: 'NEWX', email: 'not-an-email' }, 400],
    ['weak password', { organizationCode: 'NEWX', password: 'short' }, 400],
    ['missing required field', { organizationCode: undefined }, 400],
  ])('rejects %s', async (_name, override, status) => {
    const payload = {
      companyName: 'New Company', organizationCode: 'NEWX', organizationEmail: 'org@newx.com',
      firstName: 'New', lastName: 'Admin', email: 'new@newx.com', password,
      ...override,
    };
    expect((await request(app).post('/api/auth/register').send(payload)).status).toBe(status);
  });
});

describe('tenant isolation and related-entity security', () => {
  test('does not expose or mutate another organization project or task', async () => {
    const headers = auth(usersA.organization_admin);
    expect((await request(app).get(`/api/projects/${projectB._id}`).set(headers)).status).toBe(404);
    expect((await request(app).put(`/api/projects/${projectB._id}`).set(headers).send({ name: 'hacked' })).status).toBe(404);
    expect((await request(app).delete(`/api/projects/${projectB._id}`).set(headers)).status).toBe(404);
    expect((await request(app).get(`/api/tasks/${taskB._id}`).set(headers)).status).toBe(404);
    expect((await request(app).put(`/api/tasks/${taskB._id}`).set(headers).send({ title: 'hacked' })).status).toBe(404);
    expect((await request(app).delete(`/api/tasks/${taskB._id}`).set(headers)).status).toBe(404);
    expect((await request(app).post(`/api/tasks/${taskB._id}/duplicate`).set(headers)).status).toBe(404);
  });

  test('blocks cross-tenant comments, notifications, activity, reports, calendar and search', async () => {
    const headers = auth(usersA.employee);
    expect((await request(app).get(`/api/comments/task/${taskB._id}`).set(headers)).status).toBe(404);
    expect((await request(app).post('/api/comments').set(headers).send({ taskId: taskB._id, message: 'x' })).status).toBe(404);
    expect((await request(app).get(`/api/activity/task/${taskB._id}`).set(headers)).body.data).toHaveLength(0);
    expect((await request(app).get('/api/notifications').set(headers)).body.data).toHaveLength(0);
    expect((await request(app).get('/api/calendar').set(headers)).body.data.every(event => ![String(projectB._id), String(taskB._id)].includes(String(event.id)))).toBe(true);
    expect((await request(app).get('/api/search?q=Project%20B').set(headers)).body.data).toHaveLength(0);
  });

  test('ignores organizationId tampering and rejects cross-tenant task relations', async () => {
    const headers = auth(usersA.organization_admin);
    const created = await request(app).post('/api/projects').set(headers).send({
      name: 'Safe Project', projectCode: 'SAFE', managerId: usersA.project_manager._id,
      members: [usersA.employee._id], organizationId: orgB._id,
    });
    expect(created.status).toBe(201);
    expect(String(created.body.data.organizationId)).toBe(String(orgA._id));

    const crossTenantTask = await request(app).post('/api/tasks').set(headers).send({
      projectId: projectA._id, title: 'Bad assignment', assignedTo: [usersB.employee._id], organizationId: orgB._id,
    });
    expect(crossTenantTask.status).toBe(400);

    const badProject = await request(app).post('/api/tasks').set(headers).send({ projectId: projectB._id, title: 'Bad project' });
    expect(badProject.status).toBe(404);
  });

  test('rejects cross-tenant project membership changes', async () => {
    const headers = auth(usersA.organization_admin);
    const response = await request(app).put(`/api/projects/${projectA._id}/members`).set(headers).send({ action: 'add', userId: usersB.employee._id });
    expect(response.status).toBe(404);
  });
});

describe('RBAC and input security', () => {
  test('viewer cannot mutate tasks', async () => {
    const headers = auth(usersA.viewer);
    expect((await request(app).post('/api/tasks').set(headers).send({ projectId: projectA._id, title: 'x' })).status).toBe(403);
    expect((await request(app).put(`/api/tasks/${taskA._id}`).set(headers).send({ title: 'x' })).status).toBe(403);
    expect((await request(app).delete(`/api/tasks/${taskA._id}`).set(headers)).status).toBe(403);
    expect((await request(app).post(`/api/tasks/${taskA._id}/duplicate`).set(headers)).status).toBe(403);
  });

  test('employee cannot administer users or projects', async () => {
    const headers = auth(usersA.employee);
    expect((await request(app).post('/api/users').set(headers).send({ firstName: 'X', lastName: 'Y', email: 'x@y.com', password })).status).toBe(403);
    expect((await request(app).post('/api/projects').set(headers).send({ name: 'X', projectCode: 'X', managerId: usersA.employee._id })).status).toBe(403);
  });

  test('organization admin cannot promote a user to super_admin or update protected organization fields', async () => {
    const headers = auth(usersA.organization_admin);
    const userResponse = await request(app).put(`/api/users/${usersA.employee._id}`).set(headers).send({ role: 'super_admin', organizationId: orgB._id });
    expect(userResponse.status).toBe(403);
    const orgResponse = await request(app).put('/api/organizations/me').set(headers).send({ _id: orgB._id, status: 'suspended', organizationId: orgB._id });
    expect(orgResponse.status).toBe(200);
    expect(String(orgResponse.body.data._id)).toBe(String(orgA._id));
    expect(orgResponse.body.data.status).toBe('active');
  });

  test('invalid IDs return 400 and valid missing IDs return 404', async () => {
    const headers = auth(usersA.employee);
    expect((await request(app).get('/api/tasks/not-an-object-id').set(headers)).status).toBe(400);
    expect((await request(app).get(`/api/tasks/${new mongoose.Types.ObjectId()}`).set(headers)).status).toBe(404);
    expect((await request(app).get('/api/comments/task/not-an-object-id').set(headers)).status).toBe(400);
  });

  test('error responses do not expose stack traces or credentials', async () => {
    const response = await request(app).get('/api/tasks/not-an-object-id');
    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
    expect(response.body.stack).toBeUndefined();
    expect(JSON.stringify(response.body)).not.toContain(password);
  });
});

describe('fixtures are tenant-specific', () => {
  test('fixture resources exist only in their own organizations', async () => {
    expect(String(taskA.organizationId)).toBe(String(orgA._id));
    expect(String(taskB.organizationId)).toBe(String(orgB._id));
    expect(String(commentB.organizationId)).toBe(String(orgB._id));
    expect(String(notificationB.organizationId)).toBe(String(orgB._id));
    expect(String(activityB.organizationId)).toBe(String(orgB._id));
  });
});
