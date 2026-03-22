import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import { authenticateUser } from '../services/authService.js';

const router = Router();

router.post('/login', (req, res) => {
  const { username, password } = req.body as { username?: string; password?: string };

  if (!username || !password) {
    return res.status(400).json({ message: '用户名和密码必填' });
  }

  const result = authenticateUser(username, password);
  if (!result) {
    return res.status(401).json({ message: '用户名或密码错误' });
  }

  return res.json(result);
});

router.get('/me', requireAuth, (req, res) => {
  if (!req.user) {
    return res.status(404).json({ message: 'User not found' });
  }
  return res.json(req.user);
});

export default router;
