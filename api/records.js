const fileStorage = require('../lib/fileStorage');

module.exports = async (req, res) => {
  // 设置CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 验证令牌
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未提供认证令牌' });
  }

  const token = authHeader.substring(7);
  const payload = fileStorage.verifyToken(token);
  
  if (!payload) {
    return res.status(401).json({ error: '无效的认证令牌' });
  }

  try {
    const users = await fileStorage.readFile('users.json');
    const user = users.find(u => u.id === payload.userId);
    
    if (!user) {
      return res.status(401).json({ error: '用户不存在' });
    }

    // 处理不同请求
    switch (req.method) {
      case 'GET':
        await handleGetRecords(user, res);
        break;
      case 'POST':
        await handleCreateRecord(user, req, res);
        break;
      case 'PUT':
        await handleUpdateRecord(user, req, res);
        break;
      case 'DELETE':
        await handleDeleteRecord(user, req, res);
        break;
      default:
        res.status(405).json({ error: '方法不允许' });
    }
  } catch (error) {
    console.error('记录API错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
};

async function handleGetRecords(user, res) {
  const records = await fileStorage.readFile('records.json');
  
  // 只返回当前用户的记录
  const userRecords = records.filter(record => record.userId === user.id);
  
  // 按时间倒序排序
  userRecords.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  
  res.json({
    success: true,
    records: userRecords,
    total: userRecords.length
  });
}

async function handleCreateRecord(user, req, res) {
  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  
  // 验证试用用户限制
  if (user.userType === 'trial') {
    const trialLimits = await fileStorage.readFile('trial-limits.json');
    const userLimit = trialLimits[user.username] || { count: 0, createdAt: new Date().toISOString() };
    
    // 检查试用次数
    if (userLimit.count >= 18) {
      // 检查试用期是否过期（7天）
      const trialAge = Date.now() - new Date(userLimit.createdAt).getTime();
      const TRIAL_PERIOD_MS = 7 * 24 * 60 * 60 * 1000;
      
      if (trialAge > TRIAL_PERIOD_MS) {
        return res.status(403).json({ 
          error: '试用期已过期（7天）',
          trialInfo: {
            used: userLimit.count,
            remaining: 0,
            expired: true
          }
        });
      }
      
      return res.status(403).json({ 
        error: '试用次数已用完（最多18次）',
        trialInfo: {
          used: userLimit.count,
          remaining: 0,
          expired: false
        }
      });
    }
    
    // 增加计数
    userLimit.count += 1;
    userLimit.lastUsed = new Date().toISOString();
    trialLimits[user.username] = userLimit;
    await fileStorage.writeFile('trial-limits.json', trialLimits);
  }

  // 创建新记录
  const newRecord = {
    id: fileStorage.generateId(),
    userId: user.id,
    username: user.username,
    ...body,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  // 保存记录
  const records = await fileStorage.readFile('records.json');
  records.push(newRecord);
  await fileStorage.writeFile('records.json', records);

  // 更新用户试用数据
  if (user.userType === 'trial') {
    user.trialData.count = (user.trialData.count || 0) + 1;
    user.trialData.lastUpdate = new Date().toISOString();
    
    const users = await fileStorage.readFile('users.json');
    const userIndex = users.findIndex(u => u.id === user.id);
    if (userIndex !== -1) {
      users[userIndex] = user;
      await fileStorage.writeFile('users.json', users);
    }
  }

  res.json({
    success: true,
    record: newRecord,
    trialInfo: user.userType === 'trial' ? {
      used: user.trialData.count || 0,
      remaining: 18 - (user.trialData.count || 0),
      daysLeft: 7 - Math.floor(
        (Date.now() - new Date(user.trialData.createdAt).getTime()) / (24 * 60 * 60 * 1000)
      )
    } : null
  });
}

async function handleUpdateRecord(user, req, res) {
  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  const { recordId, updates } = body;

  if (!recordId || !updates) {
    return res.status(400).json({ error: '缺少必要参数' });
  }

  const records = await fileStorage.readFile('records.json');
  const recordIndex = records.findIndex(
    r => r.id === recordId && r.userId === user.id
  );

  if (recordIndex === -1) {
    return res.status(404).json({ error: '记录不存在或无权访问' });
  }

  // 更新记录
  records[recordIndex] = {
    ...records[recordIndex],
    ...updates,
    updatedAt: new Date().toISOString()
  };

  await fileStorage.writeFile('records.json', records);
  res.json({ success: true, record: records[recordIndex] });
}

async function handleDeleteRecord(user, req, res) {
  const { recordId } = req.query;

  if (!recordId) {
    return res.status(400).json({ error: '缺少记录ID' });
  }

  const records = await fileStorage.readFile('records.json');
  const recordIndex = records.findIndex(
    r => r.id === recordId && r.userId === user.id
  );

  if (recordIndex === -1) {
    return res.status(404).json({ error: '记录不存在或无权访问' });
  }

  // 删除记录
  const deletedRecord = records.splice(recordIndex, 1)[0];
  await fileStorage.writeFile('records.json', records);

  // 如果是试用用户，减少试用计数（可选）
  if (user.userType === 'trial') {
    user.trialData.count = Math.max(0, (user.trialData.count || 0) - 1);
    
    const users = await fileStorage.readFile('users.json');
    const userIndex = users.findIndex(u => u.id === user.id);
    if (userIndex !== -1) {
      users[userIndex] = user;
      await fileStorage.writeFile('users.json', users);
    }
  }

  res.json({ success: true, message: '记录已删除', record: deletedRecord });
}
