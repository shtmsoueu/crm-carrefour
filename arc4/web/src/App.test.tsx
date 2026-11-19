import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { rotuloEps } from './eps';

function renderizar() {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={cliente}>
      <App />
    </QueryClientProvider>,
  );
}

function respostaApi(status: number, corpo: unknown) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(corpo), { status })));
}

afterEach(() => vi.unstubAllGlobals());

describe('App', () => {
  it('mostra as carteiras no formato código · nome', () => {
    respostaApi(200, { status: 'ok', versao: '0.1.0', banco: 'ok', migracao: '0001' });
    renderizar();
    expect(screen.getByText('0140 · CLEAN')).toBeInTheDocument();
    expect(screen.getByText('0144 · CAÍDOS')).toBeInTheDocument();
    expect(screen.getByText('0900 · DESAFIANTE')).toBeInTheDocument();
  });

  it('mostra a API operacional com a migração aplicada', async () => {
    respostaApi(200, { status: 'ok', versao: '0.1.0', banco: 'ok', migracao: '0001' });
    renderizar();
    expect(await screen.findByText('Operacional')).toBeInTheDocument();
    expect(screen.getByText('0001')).toBeInTheDocument();
  });

  it('avisa com texto quando o banco está indisponível', async () => {
    respostaApi(503, { status: 'degradado', versao: '0.1.0', banco: 'indisponivel', migracao: null });
    renderizar();
    expect(await screen.findByText('API ativa, banco indisponível')).toBeInTheDocument();
  });

  it('avisa quando a API não responde', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('falha de rede')));
    renderizar();
    expect(await screen.findByText('API indisponível')).toBeInTheDocument();
  });
});

describe('rotuloEps', () => {
  it('rejeita código desconhecido', () => {
    // @ts-expect-error código fora do domínio
    expect(() => rotuloEps('0141')).toThrow();
  });
});
