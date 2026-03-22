import bcrypt from 'bcryptjs';
import jwt, { type JwtPayload, type Secret, type SignOptions } from 'jsonwebtoken';
import { db } from '../db.js';
import { JWT_EXPIRES_IN, JWT_SECRET } from '../config.js';

interface DbUser {
  id: number;
  username: string;
  password_hash: string;
  display_name: string;
  role: string;
}

export interface AuthenticatedUser {
  id: number;
  username: string;
  displayName: string;
  role: 'admin';
}

export function authenticateUser(username: string, password: string) {
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as DbUser | undefined;
  if (!user) {
    return null;
  }

  const isValid = bcrypt.compareSync(password, user.password_hash);
  if (!isValid) {
    return null;
  }

  const payload = { sub: user.id, username: user.username, role: user.role };
  const options: SignOptions = {
    expiresIn: JWT_EXPIRES_IN as SignOptions['expiresIn'],
  };

  const token = jwt.sign(payload, JWT_SECRET as Secret, options);

  return {
    token,
    user: {
      id: user.id,
      username: user.username,
      displayName: user.display_name,
      role: 'admin',
    } satisfies AuthenticatedUser,
  };
}

export function verifyToken(token: string) {
  const decoded = jwt.verify(token, JWT_SECRET as Secret);
  if (typeof decoded === 'string') {
    throw new Error('Invalid token payload');
  }
  return decoded as JwtPayload & { sub: number; username: string; role: string };
}

export function getUserById(userId: number) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as DbUser | undefined;
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    username: user.username,
    displayName: user.display_name,
    role: 'admin',
  } satisfies AuthenticatedUser;
}
