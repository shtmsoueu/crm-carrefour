/** Conector SIC com fetch simulado: login, reuso do token, renovação após 401 e túnel fora do ar. */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

process.env.SIC_API_URL = 'https://sic.exemplo.test/';
process.env.SIC_USUARIO = 'usuario-teste';
process.env.SIC_SENHA = 'senha-teste';
process.env.SIC_SERVER = 'srv';

let sic: typeof import('../src/integrations/sic.js');
beforeAll(async () => {
  sic = await import('../src/integrations/sic.js');
});
afterEach(() => vi.unstubAllGlobals());

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const loginOk = (n: number) => json(200, { access_token: `tok${n}`, token_type: 'bearer', expires_in: 43200, expires_at: new Date(Date.now() + 43_200_000).toISOString(), usuario: { perfil: 'admin' } });

describe('conector SIC', () => {
  it('faz login uma vez, reutiliza o token e envia somente GET com Bearer', async () => {
    let logins = 0;
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith('/auth/login')) {
        expect(JSON.parse(String(init.body))).toEqual({ usuario: 'usuario-teste', senha: 'senha-teste' });
        return loginOk(++logins);
      }
      expect(init.method).toBe('GET');
      expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok1');
      return json(200, { ok: url });
    });
    vi.stubGlobal('fetch', fetchMock);
    await sic.sicConsulta('acordos', '123');
    const r = await sic.sicConsulta('divida', '45 6');
    expect(logins).toBe(1);
    expect((r as { ok: string }).ok).toBe('https://sic.exemplo.test/srv/divida/45%206');
  });

  it('renova o token quando a sessão é revogada (401)', async () => {
    let n = 1;
    let first = true;
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/auth/login')) return loginOk(++n);
      if (first) {
        first = false;
        return json(401, { detail: 'Token inválido' });
      }
      return json(200, { id: 1 });
    }));
    expect(await sic.sicGet('/srv/cadastro/1')).toEqual({ id: 1 });
  });

  it('traduz túnel fora do ar e servidor inválido em mensagens claras', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>ERR_NGROK_3200</html>', { status: 404 })));
    await expect(sic.sicGet('/srv/cadastro/1')).rejects.toThrow(/túnel fora do ar/);
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (url.endsWith('/auth/login') ? loginOk(9) : json(400, { detail: 'Servidor inválido' }))));
    await expect(sic.sicConsulta('cadastro', '1')).rejects.toThrow(/Servidor inválido/);
  });

  it('status não expõe senha nem token', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (url.endsWith('/auth/login') ? loginOk(10) : url.endsWith('/auth/me') ? json(200, { perfil: 'admin', expira_em: '2026-11-20T10:00:00' }) : json(404, { detail: 'não encontrado' }))));
    const st = await sic.sicStatus();
    expect(st).toMatchObject({ configurado: true, conectado: true, perfil: 'admin', host: 'sic.exemplo.test', erro: null });
    expect(JSON.stringify(st)).not.toMatch(/senha-teste|tok10/);
  });
});
