export type Saude = {
  status: 'ok' | 'degradado';
  versao: string;
  banco: 'ok' | 'indisponivel';
  migracao: string | null;
};

/** GET /api/health. 503 também traz corpo (banco indisponível), então não é tratado como exceção. */
export async function buscarSaude(signal?: AbortSignal): Promise<Saude> {
  const r = await fetch('/api/health', { signal, headers: { Accept: 'application/json' } });
  if (r.status !== 200 && r.status !== 503) throw new Error(`API respondeu ${r.status}`);
  return (await r.json()) as Saude;
}
