import bcrypt from 'bcryptjs';
import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { pool } from '../db/pool.js';
import type { Actor } from '../services/audit.js';

export type Role = 'ADMIN' | 'OPERADOR' | 'CONSULTA';
export const COOKIE = 'crm_session';

export interface SessionUser {
  id: number;
  username: string;
  name: string;
  role: Role;
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: SessionUser;
  }
}

export function actorOf(req: Request): Actor {
  return { id: req.user?.id ?? null, username: req.user?.username ?? 'anonimo', role: req.user?.role, ip: req.ip };
}

export async function hashPassword(p: string): Promise<string> {
  return bcrypt.hash(p, 12);
}

export function validatePassword(p: string): string | null {
  if (typeof p !== 'string' || p.length < 10) return 'A senha deve ter no mínimo 10 caracteres.';
  if (!/[A-Za-z]/.test(p) || !/\d/.test(p)) return 'A senha deve conter letras e números.';
  return null;
}

// Limite simples de tentativas de login por IP+usuário (proteção contra força bruta).
const attempts = new Map<string, { n: number; until: number }>();
const MAX_ATTEMPTS = 8;
let DUMMY_HASH: string | undefined;
const WINDOW_MS = 15 * 60 * 1000;

export async function login(username: string, password: string, ip: string): Promise<SessionUser | { blocked: true } | null> {
  const key = `${ip}|${username.toLowerCase()}`;
  const a = attempts.get(key);
  if (a && a.n >= MAX_ATTEMPTS && a.until > Date.now()) return { blocked: true };
  const r = await pool.query(`SELECT id, username, name, role, password_hash, active FROM users WHERE lower(username) = lower($1)`, [username]);
  const u = r.rows[0];
  // Compara mesmo quando o usuário não existe, para tempo de resposta uniforme.
  const ok = await bcrypt.compare(password, u?.password_hash ?? (DUMMY_HASH ??= bcrypt.hashSync('usuario-inexistente', 12)));
  if (!u || !u.active || !ok) {
    attempts.set(key, { n: (a && a.until > Date.now() ? a.n : 0) + 1, until: Date.now() + WINDOW_MS });
    return null;
  }
  attempts.delete(key);
  await pool.query(`UPDATE users SET last_login_at = now() WHERE id = $1`, [u.id]);
  return { id: u.id, username: u.username, name: u.name, role: u.role };
}

export function issueSession(res: Response, user: SessionUser) {
  const token = jwt.sign({ sub: String(user.id) }, config.jwtSecret, { expiresIn: `${config.sessionHours}h` });
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'strict', secure: config.isProd, maxAge: config.sessionHours * 3600 * 1000, path: '/' });
}

export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.[COOKIE];
  if (!token) return next();
  try {
    const payload = jwt.verify(token, config.jwtSecret) as jwt.JwtPayload;
    // Usuário é recarregado a cada requisição: desativação/alteração de perfil vale imediatamente.
    const r = await pool.query(`SELECT id, username, name, role FROM users WHERE id = $1 AND active`, [Number(payload.sub)]);
    if (r.rows[0]) req.user = r.rows[0];
  } catch {
    /* sessão inválida/expirada */
  }
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: 'Sessão expirada ou não autenticada.' });
  next();
}

const LEVEL: Record<Role, number> = { CONSULTA: 1, OPERADOR: 2, ADMIN: 3 };
export function requireRole(min: Role) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado.' });
    if (LEVEL[req.user.role] < LEVEL[min]) return res.status(403).json({ error: 'Perfil sem permissão para esta operação.' });
    next();
  };
}
