import type { AliadoClientesResponse, AllyCaseRow, CatalogosResponse } from '@/lib/movil/contract';
import { router, useFocusEffect } from 'expo-router';
import { Search, UserPlus } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, ApiError } from '@/services/api';
import { useApi } from '@/services/hooks';
import { HeaderActions } from '@/ui/aliado/HeaderActions';
import { CaseCard, Chip } from '@/ui/aliado/parts';
import { Empty, ErrorState, Loading, T } from '@/ui/kit';
import { colors, fonts, radius, space } from '@/ui/theme';

interface ListState {
  items: AllyCaseRow[];
  total: number;
  page: number;
  pageCount: number;
}

export default function Clientes() {
  const catalogos = useApi<CatalogosResponse>('/aliado/catalogos');
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [etapa, setEtapa] = useState('');
  const [list, setList] = useState<ListState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const request = useRef(0);

  // Búsqueda con espera corta para no consultar en cada tecla.
  useEffect(() => {
    const t = setTimeout(() => setQuery(q.trim()), 350);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(
    async (page: number, mode: 'initial' | 'refresh' | 'more') => {
      const id = ++request.current;
      if (mode === 'refresh') setRefreshing(true);
      if (mode === 'more') setLoadingMore(true);
      const params = new URLSearchParams({ pagina: String(page) });
      if (query) params.set('q', query);
      if (etapa) params.set('etapa', etapa);
      try {
        const res = await api.get<AliadoClientesResponse>(`/aliado/clientes?${params.toString()}`);
        if (id !== request.current) return;
        setList((prev) => ({ items: page > 1 && prev ? [...prev.items, ...res.items.filter((i) => !prev.items.some((p) => p.id === i.id))] : res.items, total: res.total, page: res.page, pageCount: res.pageCount }));
        setError(null);
      } catch (e) {
        if (id !== request.current) return;
        setError(e instanceof ApiError ? e.message : 'No pudimos cargar tus clientes.');
      } finally {
        if (id === request.current) {
          setLoading(false);
          setRefreshing(false);
          setLoadingMore(false);
        }
      }
    },
    [query, etapa],
  );

  useFocusEffect(
    useCallback(() => {
      void load(1, 'initial');
    }, [load]),
  );

  const stages = [{ code: '', label: 'Todas' }, ...(catalogos.data?.stages ?? [])];
  const filtered = Boolean(query || etapa);

  const header = (
    <View style={{ gap: space.md, marginBottom: space.md }}>
      <View style={s.head}>
        <View style={{ flex: 1 }}>
          <T v="title">Clientes</T>
          <T v="muted" style={{ marginTop: 4 }}>{list ? `${list.total} ${list.total === 1 ? 'caso' : 'casos'}${filtered ? ' con este filtro' : ' en tu cartera'}` : 'Tu cartera'}</T>
        </View>
        <HeaderActions />
      </View>
      <View style={s.search}>
        <Search size={18} color={colors.muted} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Nombre, código OV-1001 o últimos 4"
          placeholderTextColor="#8b9aa1"
          style={s.searchInput}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel="Buscar cliente por nombre, código o últimos 4 del documento"
        />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {stages.map((st) => (
          <Chip key={st.code || 'all'} label={st.label} selected={etapa === st.code} onPress={() => setEtapa(st.code)} />
        ))}
      </ScrollView>
    </View>
  );

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <FlatList
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: space.lg, paddingBottom: 110 }}
        data={list?.items ?? []}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={header}
        ItemSeparatorComponent={() => <View style={{ height: space.sm }} />}
        renderItem={({ item }) => <CaseCard item={item} />}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(1, 'refresh')} tintColor={colors.mint} />}
        onEndReachedThreshold={0.4}
        onEndReached={() => {
          if (list && list.page < list.pageCount && !loadingMore && !loading) void load(list.page + 1, 'more');
        }}
        ListEmptyComponent={
          loading ? (
            <Loading />
          ) : error ? (
            <ErrorState message={error} onRetry={() => load(1, 'initial')} />
          ) : (
            <Empty>{filtered ? 'Ningún caso coincide con la búsqueda o la etapa elegida.' : 'Aún no tienes clientes. Registra el primero con "Nuevo cliente".'}</Empty>
          )
        }
        ListFooterComponent={
          loadingMore ? (
            <ActivityIndicator color={colors.mint} style={{ marginTop: space.lg }} />
          ) : list && list.items.length > 0 ? (
            <T v="small" style={{ textAlign: 'center', marginTop: space.lg }}>
              {list.items.length} de {list.total}
              {error ? ` · ${error}` : ''}
            </T>
          ) : null
        }
      />
      <Pressable style={({ pressed }) => [s.fab, pressed && { opacity: 0.85 }]} onPress={() => router.push('/(aliado)/clientes/nuevo')} accessibilityRole="button" accessibilityLabel="Nuevo cliente">
        <UserPlus size={20} color={colors.navy} />
        <Text style={s.fabText}>Nuevo cliente</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.white, borderWidth: 1, borderColor: '#c3d2d7', borderRadius: radius.md, paddingHorizontal: 12, minHeight: 48 },
  searchInput: { flex: 1, fontFamily: fonts.body, fontSize: 15, color: colors.ink, paddingVertical: 10 },
  fab: {
    position: 'absolute',
    right: space.lg,
    bottom: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.mint,
    paddingHorizontal: 18,
    height: 52,
    borderRadius: 26,
    boxShadow: '0 4px 12px rgba(12, 43, 59, 0.25)',
  },
  fabText: { color: colors.navy, fontFamily: fonts.bold, fontSize: 15 },
});
