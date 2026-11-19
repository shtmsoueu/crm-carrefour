export class ApiError extends Error {
  constructor(message: string, public status: number, public details?: unknown) {
    super(message);
  }
}

let onUnauthorized: () => void = () => undefined;
export const setUnauthorizedHandler = (fn: () => void) => (onUnauthorized = fn);

export async function api<T = any>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  const res = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    ...rest,
    headers: json !== undefined ? { 'Content-Type': 'application/json', ...(rest.headers ?? {}) } : rest.headers,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  if (res.status === 401 && !path.startsWith('/auth/')) onUnauthorized();
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // Resposta não-JSON (ex.: página HTML da hospedagem quando a API não existe).
    throw new ApiError(`A API respondeu em formato inesperado (HTTP ${res.status})`, res.status === 200 ? 502 : res.status);
  }
  if (!res.ok) throw new ApiError(data?.error ?? `Falha na requisição (${res.status})`, res.status, data?.details);
  return data as T;
}

/** Monta a query string ignorando valores vazios. */
export function qs(params: Record<string, unknown>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') u.set(k, String(v));
  const s = u.toString();
  return s ? `?${s}` : '';
}

export const exportUrl = (path: string, params: Record<string, unknown>, format: 'csv' | 'xlsx') => `/api${path}${qs({ ...params, format })}`;

/** Monta o FormData compactando o arquivo (gzip) no navegador quando suportado. */
export async function fileForm(file: File, extra: Record<string, string> = {}): Promise<FormData> {
  const fd = new FormData();
  if (typeof CompressionStream !== 'undefined' && file.size > 0) {
    const gz = await new Response(file.stream().pipeThrough(new CompressionStream('gzip'))).blob();
    fd.append('encoding', 'gzip');
    fd.append('file', new File([gz], file.name, { type: 'application/gzip' }));
  } else fd.append('file', file);
  for (const [k, v] of Object.entries(extra)) if (v) fd.append(k, v);
  return fd;
}
