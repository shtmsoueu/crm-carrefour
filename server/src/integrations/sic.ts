/**
 * Conector da API SIC (somente leitura).
 * - Credenciais apenas em variáveis de ambiente (SIC_API_URL, SIC_USUARIO, SIC_SENHA, SIC_SERVER); nunca no banco nem no código.
 * - Token Bearer (12 h) reutilizado em memória e renovado antes de expirar ou ao receber 401.
 * - Somente GET em rotas da lista abaixo: o CRM nunca grava no SIC.
 */
import { config } from '../config.js';

export class SicError extends Error {
  constructor(message: string, public status = 502) {
    super(message);
  }
}

/** Rotas de consulta do SIC liberadas no CRM (Swagger da API SIC v2.0.0). */
export const SIC_RESOURCES = ['cadastro', 'cadastro_portal', 'divida', 'acordos', 'buscar_cpf_cnpj', 'buscar_telefone'] as const;
export type SicResource = (typeof SIC_RESOURCES)[number];

const TIMEOUT_MS = 30_000;
let session: { token: string; expiresAt: number; perfil?: string; nome?: string } | null = null;

const base = () => config.sic.url.replace(/\/+$/, '');
export const sicConfigured = () => !!(config.sic.url && config.sic.usuario && config.sic.senha);

async function request(method: 'GET' | 'POST', path: string, init: { body?: unknown; token?: string } = {}) {
  const headers: Record<string, string> = { Accept: 'application/json', 'ngrok-skip-browser-warning': '1' };
  if (init.body !== undefined) headers['Content-Type'] = 'application/json';
  if (init.token) headers.Authorization = `Bearer ${init.token}`;
  let res: Response;
  try {
    res = await fetch(base() + path, { method, headers, body: init.body === undefined ? undefined : JSON.stringify(init.body), signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (e) {
    const timeout = (e as Error).name === 'TimeoutError';
    throw new SicError(timeout ? 'A API SIC não respondeu a tempo.' : 'Não foi possível conectar à API SIC. Verifique o endereço (SIC_API_URL) e se o túnel está ativo.', 504);
  }
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // ngrok devolve HTML quando o túnel está fora do ar
    if (!res.ok || /<html/i.test(text)) throw new SicError(`A API SIC respondeu ${res.status} sem JSON (túnel fora do ar ou endereço alterado).`, 502);
  }
  return { status: res.status, data };
}

const detail = (d: unknown) => (d && typeof d === 'object' && 'detail' in d ? String((d as { detail: unknown }).detail) : '');

async function login() {
  if (!sicConfigured()) throw new SicError('Integração SIC não configurada (SIC_API_URL, SIC_USUARIO e SIC_SENHA).', 503);
  const r = await request('POST', '/auth/login', { body: { usuario: config.sic.usuario, senha: config.sic.senha } });
  const d = r.data as { access_token?: string; expires_at?: string; expires_in?: number; usuario?: { perfil?: string; nome?: string } } | null;
  if (r.status !== 200 || !d?.access_token) throw new SicError(r.status === 401 ? 'Usuário ou senha do SIC recusados.' : `Falha no login do SIC (${r.status}) ${detail(r.data)}`.trim(), 502);
  const exp = d.expires_at ? Date.parse(d.expires_at) : NaN;
  session = {
    token: d.access_token,
    // renova 10 minutos antes; sem data válida, usa expires_in ou 1 hora
    expiresAt: (Number.isFinite(exp) ? exp : Date.now() + (d.expires_in ? d.expires_in * 1000 : 3_600_000)) - 600_000,
    perfil: d.usuario?.perfil,
    nome: d.usuario?.nome,
  };
  return session;
}

const sessionPerfil = () => session?.perfil ?? null;

async function token() {
  if (session && session.expiresAt > Date.now()) return session.token;
  return (await login()).token;
}

/** GET autenticado; renova o token uma vez se a sessão tiver sido revogada. */
export async function sicGet(path: string): Promise<unknown> {
  let r = await request('GET', path, { token: await token() });
  if (r.status === 401) {
    session = null;
    r = await request('GET', path, { token: await token() });
  }
  if (r.status === 404) return null;
  if (r.status !== 200) throw new SicError(`API SIC: ${detail(r.data) || `erro ${r.status}`}`, r.status === 400 ? 400 : 502);
  return r.data;
}

export async function sicConsulta(resource: SicResource, id: string, server = config.sic.server) {
  if (!server) throw new SicError('Defina o servidor do SIC (SIC_SERVER).', 503);
  const clean = id.trim();
  if (!clean || clean.length > 40) throw new SicError('Identificador inválido.', 400);
  return sicGet(`/${encodeURIComponent(server)}/${resource}/${encodeURIComponent(clean)}`);
}

/** Situação da conexão, sem expor senha nem token. */
export async function sicStatus() {
  const host = (() => {
    try {
      return config.sic.url ? new URL(config.sic.url).host : null;
    } catch {
      return 'endereço inválido';
    }
  })();
  const out = { configurado: sicConfigured(), host, usuario: config.sic.usuario || null, servidor: config.sic.server || null, conectado: false, perfil: null as string | null, expira_em: null as string | null, erro: null as string | null };
  if (!out.configurado) return out;
  try {
    session = null; // teste real: força novo login
    const me = (await sicGet('/auth/me')) as { perfil?: string; expira_em?: string } | null;
    out.conectado = true;
    out.perfil = me?.perfil ?? sessionPerfil();
    out.expira_em = me?.expira_em ?? null;
    if (out.servidor) {
      // valida o servidor configurado sem trazer dados de clientes (id inexistente)
      try {
        await sicGet(`/${encodeURIComponent(out.servidor)}/cadastro/0`);
      } catch (e) {
        if (/servidor inv/i.test((e as Error).message)) out.erro = `Servidor "${out.servidor}" não reconhecido pelo SIC.`;
      }
    }
  } catch (e) {
    out.erro = (e as Error).message;
  }
  return out;
}
