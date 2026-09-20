import { useEffect, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { cleanSearch } from '../lib/helpers';
import { PAGE_SIZE } from '../lib/constants';

export function useDebounce(value, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** إعدادات الجهة والامتحان (صف واحد، مقروء للجميع) */
export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('settings').select('*').eq('id', 1).maybeSingle();
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60_000,
  });
}

/** القوائم المرجعية: المكاتب، المستويات، الدورات */
export function useLookups() {
  return useQuery({
    queryKey: ['lookups'],
    queryFn: async () => {
      const [offices, levels, cycles] = await Promise.all([
        supabase.from('offices').select('*').order('sort_order').order('name'),
        supabase.from('levels').select('*').order('sort_order').order('name'),
        supabase.from('cycles').select('*').order('created_at', { ascending: false }),
      ]);
      for (const r of [offices, levels, cycles]) if (r.error) throw r.error;
      return {
        offices: offices.data,
        levels: levels.data,
        cycles: cycles.data,
        currentCycle: cycles.data.find((c) => c.is_current) || null,
      };
    },
    staleTime: 5 * 60_000,
  });
}

/** المحفّظون الفعّالون (لقوائم التحويل والتصفية) */
export function useExaminers() {
  return useQuery({
    queryKey: ['examiners-list'],
    queryFn: async () => {
      const { data, error } = await supabase.from('v_examiners').select('*').order('full_name');
      if (error) throw error;
      return data;
    },
    staleTime: 60_000,
  });
}

function applyFilters(req, { filters, searchCols, search, extra }) {
  for (const [k, v] of Object.entries(filters || {})) {
    if (v === '' || v === null || v === undefined) continue;
    req = Array.isArray(v) ? req.in(k, v) : req.eq(k, v);
  }
  const q = cleanSearch(search);
  if (q && searchCols?.length) req = req.or(searchCols.map((c) => `${c}.ilike.*${q}*`).join(','));
  if (extra) req = extra(req);
  return req;
}

/**
 * قائمة مرقّمة الصفحات من جدول أو عرض، مع بحث وتصفية على الخادم.
 * تُرجع أيضاً fetchAll() لتصدير كل النتائج المطابقة.
 */
export function usePagedList({ key, source, select = '*', searchCols = [], filters = {}, order = ['created_at', false], extra, pageSize = PAGE_SIZE, enabled = true }) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const dSearch = useDebounce(search);
  const filterKey = JSON.stringify(filters);

  useEffect(() => setPage(1), [dSearch, filterKey]);

  const query = useQuery({
    queryKey: [key, source, dSearch, filterKey, page, pageSize],
    enabled,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let req = supabase.from(source).select(select, { count: 'exact' });
      req = applyFilters(req, { filters, searchCols, search: dSearch, extra });
      req = req.order(order[0], { ascending: order[1], nullsFirst: false }).range((page - 1) * pageSize, page * pageSize - 1);
      const { data, error, count } = await req;
      if (error) throw error;
      return { rows: data, count };
    },
  });

  const fetchAll = async (limit = 10000) => {
    let req = supabase.from(source).select(select);
    req = applyFilters(req, { filters, searchCols, search: dSearch, extra });
    const { data, error } = await req.order(order[0], { ascending: order[1] }).limit(limit);
    if (error) throw error;
    return data;
  };

  return {
    rows: query.data?.rows || [],
    count: query.data?.count || 0,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
    page,
    setPage,
    pageSize,
    search,
    setSearch,
    fetchAll,
  };
}

/** عدد السجلات فقط (لشارات القائمة الجانبية) */
export function useCount(key, source, build, options = {}) {
  return useQuery({
    queryKey: ['count', key],
    queryFn: async () => {
      let req = supabase.from(source).select('id', { count: 'exact', head: true });
      if (build) req = build(req);
      const { count, error } = await req;
      if (error) throw error;
      return count;
    },
    refetchInterval: 60_000,
    ...options,
  });
}
