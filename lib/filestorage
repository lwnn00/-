const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class FileStorage {
  constructor(dataDir = './data') {
    this.dataDir = dataDir;
    this.init();
  }

  // 初始化数据目录
  async init() {
    try {
      await fs.mkdir(this.dataDir, { recursive: true });
      
      // 初始化默认文件
      const defaultFiles = {
        'users.json': [],
        'records.json': [],
        'invitations.json': [],
        'trial-limits.json': {},
        'fingerprints.json': {},
        'analytics.json': { dailyUsage: {} }
      };

      for (const [fileName, defaultValue] of Object.entries(defaultFiles)) {
        const filePath = path.join(this.dataDir, fileName);
        try {
          await fs.access(filePath);
        } catch {
          await fs.writeFile(filePath, JSON.stringify(defaultValue, null, 2));
        }
      }
    } catch (error) {
      console.error('初始化数据目录失败:', error);
    }
  }

  // 读取文件
  async readFile(fileName) {
    try {
      const filePath = path.join(this.dataDir, fileName);
      const data = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      console.error(`读取文件 ${fileName} 失败:`, error);
      // 返回默认值
      if (fileName === 'users.json') return [];
      if (fileName === 'records.json') return [];
      if (fileName === 'invitations.json') return [];
      if (fileName === 'trial-limits.json') return {};
      if (fileName === 'fingerprints.json') return {};
      return null;
    }
  }

  // 写入文件
  async writeFile(fileName, data) {
    try {
      const filePath = path.join(this.dataDir, fileName);
      await fs.writeFile(filePath, JSON.stringify(data, null, 2));
      return true;
    } catch (error) {
      console.error(`写入文件 ${fileName} 失败:`, error);
      return false;
    }
  }

  // 追加数据到文件（用于记录操作日志等）
  async appendToFile(fileName, data) {
    try {
      const filePath = path.join(this.dataDir, fileName);
      const now = new Date().toISOString();
      const logEntry = { timestamp: now, ...data };
      
      // 读取现有数据
      const existing = await this.readFile(fileName).catch(() => []);
      if (Array.isArray(existing)) {
        existing.push(logEntry);
        await this.writeFile(fileName, existing);
      }
      return true;
    } catch (error) {
      console.error(`追加数据到 ${fileName} 失败:`, error);
      return false;
    }
  }

  // 生成ID
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
  }

  // 加密密码
  hashPassword(password) {
    return crypto.createHash('sha256')
      .update(password + process.env.PASSWORD_SALT)
      .digest('hex');
  }

  // 验证密码
  verifyPassword(password, hashedPassword) {
    return this.hashPassword(password) === hashedPassword;
  }

  // 生成JWT令牌（简化版）
  generateToken(user) {
    const payload = {
      userId: user.id,
      username: user.username,
      userType: user.userType,
      exp: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60) // 7天过期
    };
    
    const header = { alg: 'HS256', typ: 'JWT' };
    const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64');
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64');
    
    const signature = crypto
      .createHmac('sha256', process.env.JWT_SECRET)
      .update(`${encodedHeader}.${encodedPayload}`)
      .digest('base64');
    
    return `${encodedHeader}.${encodedPayload}.${signature}`;
  }

  // 验证JWT令牌
  verifyToken(token) {
    try {
      const [encodedHeader, encodedPayload, signature] = token.split('.');
      
      const expectedSignature = crypto
        .createHmac('sha256', process.env.JWT_SECRET)
        .update(`${encodedHeader}.${encodedPayload}`)
        .digest('base64');
      
      if (signature !== expectedSignature) {
        return null;
      }
      
      const payload = JSON.parse(Buffer.from(encodedPayload, 'base64').toString());
      
      // 检查是否过期
      if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
        return null;
      }
      
      return payload;
    } catch (error) {
      return null;
    }
  }
}

// 单例模式
const fileStorage = new FileStorage();

// 使用示例
const exampleUser = {
  id: fileStorage.generateId(),
  username: 'test',
  password: fileStorage.hashPassword('password123'),
  userType: 'trial',
  createdAt: new Date().toISOString()
};

module.exports = fileStorage;
