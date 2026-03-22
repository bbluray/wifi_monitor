import type { NextFunction, Request, Response } from 'express';
import { getUserById, verifyToken } from '../services/authService.js';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    username: string;
    displayName: string;
    role: string;
  };
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedRequest['user'];
    }
  }
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Missing or invalid authorization header' });
  }

  const token = authHeader.slice('Bearer '.length);

  try {
    const payload = verifyToken(token);
    const user = getUserById(payload.sub);
    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }
    req.user = user;
    return next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid token', error: (error as Error).message });
  }
}

export function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Admin privileges required' });
  }
  return next();
}
