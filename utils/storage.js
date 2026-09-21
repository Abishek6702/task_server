const fs = require('fs/promises');
const path = require('path');

const storageRoot = path.resolve(__dirname, '..', 'uploads');

const ensureStorage = async () => {
  await fs.mkdir(storageRoot, { recursive: true });
};

const resolveKey = (key) => {
  if (typeof key !== 'string' || !/^[a-f0-9-]+\.[a-z0-9]+$/i.test(key)) {
    throw new Error('Invalid storage key');
  }
  const resolved = path.resolve(storageRoot, key);
  if (path.dirname(resolved) !== storageRoot) throw new Error('Invalid storage key');
  return resolved;
};

const remove = async (key) => {
  try {
    await fs.unlink(resolveKey(key));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
};

module.exports = { storageRoot, ensureStorage, resolveKey, remove };
