import { api } from './api';

export interface FieldDef { name: string; label: string; start: number; end: number; type: 'A' | 'N' | 'D'; decimals?: number; dateFormat?: string; required?: boolean; filler?: boolean; note?: string; roles?: string[] }
export interface RecordDef { code: string; name: string; length: number; fields: FieldDef[] }
export interface LayoutDef {
  code: string; title: string; sourceLayout: string | null; namingPattern: string; purpose: string; layoutAvailable: boolean;
  headerTrailer: { id: string; description: string; header?: RecordDef; trailer?: RecordDef }[];
  records: RecordDef[]; notes: { kind: string; text: string }[];
}
let cache: Promise<LayoutDef[]> | null = null;
export const getLayouts = () => (cache ??= api<LayoutDef[]>('/layouts').catch((e) => { cache = null; throw e; }));
