const fileStorage = require('../lib/fileStorage');

module.exports = async (req, res) => {
  // 验证管理员权限
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未提供认证令牌' });
  }

  const token = authHeader.substring(7);
  const payload = fileStorage.verifyToken(token);
  
  if (!payload || payload.userType !== 'admin') {
    return res.status(403).json({ error: '需要管理员权限' });
  }

  try {
    const { action } = req.query;

    switch (req.method) {
      case 'GET':
        if (action === 'stats') {
          await handleGetStats(res);
        } else if (action === 'users') {
          await handleGetUsers(res);
        } else if (action === 'records') {
          await handleGetAllRecords(res);
        }
        break;
      case 'POST':
        if (action === 'invitation') {
          await handleCreateInvitation(req, res);
        }
        break;
      default:
        res.status(405).json({ error: '方法不允许' });
    }
  } catch (error) {
    console.error('管理员API错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
};

async function handleGetStats(res) {
  const users = await fileStorage.readFile('users.json');
  const records = await fileStorage.readFile('records.json');
  const invitations = await fileStorage.readFile('invitations.json');

  const stats = {
    totalUsers: users.length,
    totalRecords: records.length,
    userTypes: {
      admin: users.filter(u => u.userType === 'admin').length,
      registered: users.filter(u => u.userType === 'registered').length,
      trial: users.filter(u => u.userType === 'trial').length
    },
    totalInvitations: invitations.length,
    usedInvitations: invitations.filter(i => i.used).length,
    recentRegistrations: users
      .sort((a, b) => new Date(b.registrationDate) - new Date(a.registrationDate))
      .slice(0, 10)
      .map(u => ({
        username: u.username,
        userType: u.userType,
        registrationDate: u.registrationDate,
        lastLogin: u.lastLogin
      }))
  };

  res.json({ success: true, stats });
}

async function handleGetUsers(res) {
  const users = await fileStorage.readFile('users.json');
  
  // 移除密码字段
  const safeUsers = users.map(({ password, ...user }) => user);
  
  res.json({ success: true, users: safeUsers });
}

async function handleGetAllRecords(res) {
  const records = await fileStorage.readFile('records.json');
  
  // 按时间倒序排序
  records.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  
  res.json({ success: true, records, total: records.length });
}

async function handleCreateInvitation(req, res) {
  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  const { count = 1, prefix = 'INV', note = '' } = body;

  const invitations = await fileStorage.readFile('invitations.json');
  const newInvitations = [];

  for (let i = 0; i < count; i++) {
    const code = `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    
    newInvitations.push({
      code,
      createdBy: 'admin',
      createdDate: new Date().toISOString(),
      used: false,
      note
    });
  }

  invitations.push(...newInvitations);
  await fileStorage.writeFile('invitations.json', invitations);

  res.json({
    success: true,
    invitations: newInvitations,
    message: `已生成 ${count} 个邀请码`
  });
}
