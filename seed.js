const mongoose = require('mongoose');
const { getMongoUri } = require('./config/env');
const dotenv = require('dotenv');
const Organization = require('./models/Organization');
const User = require('./models/User');
const Project = require('./models/Project');
const Task = require('./models/Task');
const dns = require('dns');

dotenv.config();

const connectDB = async () => {
  try {
    dns.setServers(['208.67.222.222', '208.67.220.220']);
    await mongoose.connect(getMongoUri());
    console.log('MongoDB Connected...');
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
};

const importData = async () => {
  try {
    await connectDB();

    await Organization.deleteMany();
    await User.deleteMany();
    await Project.deleteMany();
    await Task.deleteMany();

    // 1. Create Organizations
    const orgABC = await Organization.create({
      name: 'ABC Technologies',
      code: 'ABC',
      email: 'contact@abctech.com',
    });

    const orgXYZ = await Organization.create({
      name: 'XYZ Solutions',
      code: 'XYZ',
      email: 'contact@xyzsolutions.com',
    });

    // Pre-hash the password here; we'll bypass the pre-save hook by using
    // User.collection.insertMany so we control the exact stored hash.
    const hashedPassword = await require('bcryptjs').hash('password123', 10);

    // 1.5 Create Super Admin
    await User.create({
      firstName: 'Portal',
      lastName: 'Admin',
      email: 'superadmin@qpt.com',
      password: hashedPassword,
      role: 'super_admin',
    });

    // 2. Create Users for ABC
    const adminABC = await User.create({
      firstName: 'Admin',
      lastName: 'ABC',
      email: 'admin@abctech.com',
      password: hashedPassword,
      organizationId: orgABC._id,
      role: 'organization_admin',
    });

    const managerABC = await User.create({
      firstName: 'Manager',
      lastName: 'ABC',
      email: 'manager@abctech.com',
      password: hashedPassword,
      organizationId: orgABC._id,
      role: 'project_manager',
    });

    const employeeABC1 = await User.create({
      firstName: 'Emp1',
      lastName: 'ABC',
      email: 'emp1@abctech.com',
      password: hashedPassword,
      organizationId: orgABC._id,
      role: 'employee',
    });

    const employeeABC2 = await User.create({
      firstName: 'Emp2',
      lastName: 'ABC',
      email: 'emp2@abctech.com',
      password: hashedPassword,
      organizationId: orgABC._id,
      role: 'employee',
    });

    // 3. Create Users for XYZ
    const adminXYZ = await User.create({
      firstName: 'Admin',
      lastName: 'XYZ',
      email: 'admin@xyzsolutions.com',
      password: hashedPassword,
      organizationId: orgXYZ._id,
      role: 'organization_admin',
    });

    const managerXYZ = await User.create({
      firstName: 'Manager',
      lastName: 'XYZ',
      email: 'manager@xyzsolutions.com',
      password: hashedPassword,
      organizationId: orgXYZ._id,
      role: 'project_manager',
    });

    const employeeXYZ = await User.create({
      firstName: 'Emp1',
      lastName: 'XYZ',
      email: 'emp1@xyzsolutions.com',
      password: hashedPassword,
      organizationId: orgXYZ._id,
      role: 'employee',
    });

    // 4. Create Projects for ABC
    const hrmsProject = await Project.create({
      name: 'HRMS Development',
      projectCode: 'HRMS',
      organizationId: orgABC._id,
      managerId: managerABC._id,
      members: [managerABC._id, employeeABC1._id, employeeABC2._id],
      createdBy: adminABC._id,
      status: 'Active',
    });

    // 5. Create Projects for XYZ
    const crmProject = await Project.create({
      name: 'CRM Development',
      projectCode: 'CRM',
      organizationId: orgXYZ._id,
      managerId: managerXYZ._id,
      members: [managerXYZ._id, employeeXYZ._id],
      createdBy: adminXYZ._id,
      status: 'Active',
    });

    // 6. Create Tasks for ABC
    await Task.create([
      {
        taskCode: 'HRMS-101',
        title: 'Design DB Schema',
        organizationId: orgABC._id,
        projectId: hrmsProject._id,
        assignedTo: employeeABC1._id,
        createdBy: managerABC._id,
        status: 'In Progress',
        priority: 'High',
      },
      {
        taskCode: 'HRMS-102',
        title: 'Build API',
        organizationId: orgABC._id,
        projectId: hrmsProject._id,
        assignedTo: employeeABC2._id,
        createdBy: managerABC._id,
        status: 'To Do',
      }
    ]);

    // 7. Create Tasks for XYZ
    await Task.create([
      {
        taskCode: 'CRM-101',
        title: 'Setup Dashboard',
        organizationId: orgXYZ._id,
        projectId: crmProject._id,
        assignedTo: employeeXYZ._id,
        createdBy: managerXYZ._id,
        status: 'To Do',
      }
    ]);

    console.log('Data Imported!');
    process.exit();
  } catch (error) {
    console.error(`${error}`);
    process.exit(1);
  }
};

importData();
