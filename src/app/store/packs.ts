import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Pack, PackItem } from '@shared/types';
import { isRecord } from './localStore';

// Built-in packs ship as JSON under packs/. They are code-split so a pack is
// only downloaded when a Setup screen asks for the list. packs/private/ is
// gitignored; a private pack with the same id as a committed one replaces it.
const packModules = import.meta.glob('../../../packs/*.json', { import: 'default' }) as Record<
  string,
  () => Promise<unknown>
>;
const privatePackModules = import.meta.glob('../../../packs/private/*.json', { import: 'default' }) as Record<
  string,
  () => Promise<unknown>
>;

function isPackItem(v: unknown): v is PackItem {
  return isRecord(v) && typeof v['id'] === 'string' && typeof v['text'] === 'string';
}

export function isPack(v: unknown): v is Pack {
  return (
    isRecord(v) &&
    typeof v['id'] === 'string' &&
    typeof v['name'] === 'string' &&
    typeof v['description'] === 'string' &&
    typeof v['free'] === 'boolean' &&
    typeof v['minAge'] === 'number' &&
    Array.isArray(v['items']) &&
    v['items'].every(isPackItem)
  );
}

export async function loadBuiltinPacks(): Promise<Pack[]> {
  const byId = new Map<string, Pack>();
  for (const modules of [packModules, privatePackModules]) {
    const loaded = await Promise.all(Object.values(modules).map((load) => load()));
    for (const p of loaded) {
      if (isPack(p)) byId.set(p.id, p);
      else console.warn('Skipping malformed pack', p);
    }
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

const CUSTOM_KEY = 'bb:customPacks';

export function readCustomPacks(): Pack[] {
  try {
    const raw = localStorage.getItem(CUSTOM_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isPack).map((p) => ({ ...p, custom: true }));
  } catch {
    return [];
  }
}

function writeCustomPacks(packs: Pack[]) {
  localStorage.setItem(CUSTOM_KEY, JSON.stringify(packs));
}

export function newCustomPackId(): string {
  return `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

const BUILTIN_QUERY = ['packs', 'builtin'] as const;
const CUSTOM_QUERY = ['packs', 'custom'] as const;

export function usePacks() {
  const builtin = useQuery({ queryKey: BUILTIN_QUERY, queryFn: loadBuiltinPacks, staleTime: Infinity });
  const custom = useQuery({ queryKey: CUSTOM_QUERY, queryFn: () => readCustomPacks(), staleTime: Infinity });
  const packs: Pack[] = [...(builtin.data ?? []), ...(custom.data ?? [])];
  return {
    packs,
    builtin: builtin.data ?? [],
    custom: custom.data ?? [],
    isLoading: builtin.isLoading || custom.isLoading,
    error: builtin.error ?? custom.error,
  };
}

export function useCustomPackMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: CUSTOM_QUERY });
  const save = useMutation({
    mutationFn: async (pack: Pack) => {
      const existing = readCustomPacks().filter((p) => p.id !== pack.id);
      writeCustomPacks([...existing, { ...pack, custom: true }]);
      return pack;
    },
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: async (packId: string) => {
      writeCustomPacks(readCustomPacks().filter((p) => p.id !== packId));
    },
    onSuccess: invalidate,
  });
  return { save, remove };
}
