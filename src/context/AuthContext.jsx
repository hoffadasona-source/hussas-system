import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase, usernameToEmail, isConfigured } from '../lib/supabase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const qc = useQueryClient();
  const [session, setSession] = useState(undefined); // undefined = لم تُقرأ الجلسة بعد
  // الملف الشخصي مربوط بمعرّف المستخدم الذي حُمِّل له، حتى لا تُعرض صلاحيات مستخدم سابق
  const [loaded, setLoaded] = useState({ uid: null, profile: null, examiner: null });

  useEffect(() => {
    if (!isConfigured) {
      setSession(null);
      return;
    }
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const userId = session?.user?.id || null;

  const loadProfile = useCallback(async (uid) => {
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle();
    let examiner = null;
    if (profile?.role === 'examiner') {
      const { data } = await supabase.from('v_examiners').select('*').eq('user_id', uid).maybeSingle();
      examiner = data || null;
    }
    setLoaded({ uid, profile: profile || null, examiner });
  }, []);

  useEffect(() => {
    if (userId) loadProfile(userId);
    else setLoaded({ uid: null, profile: null, examiner: null });
  }, [userId, loadProfile]);

  const signIn = useCallback(async (username, password) => {
    const email = await usernameToEmail(username);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    const { data: p } = await supabase.from('profiles').select('*').eq('id', data.user.id).maybeSingle();
    if (!p || p.status !== 'active') {
      await supabase.auth.signOut();
      throw new Error(p ? 'الحساب موقوف. تواصل مع مدير النظام.' : 'لا توجد صلاحيات مرتبطة بهذا الحساب.');
    }
    supabase.rpc('record_sign_in').then(() => {});
    return p;
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    qc.clear();
  }, [qc]);

  const current = loaded.uid === userId ? loaded : { profile: null, examiner: null };
  const profile = current.profile?.status === 'active' ? current.profile : null;
  const role = profile?.role;

  const can = useCallback(
    (perm) => {
      if (!profile) return false;
      if (role === 'super_admin') return true;
      if (role === 'admin') {
        if (perm === 'final_approve') return !!profile.can_final_approve;
        if (perm === 'issue_certificates') return !!profile.can_issue_certificates;
        return perm === 'admin';
      }
      return perm === 'examiner';
    },
    [profile, role],
  );

  const value = {
    session,
    user: session?.user || null,
    profile,
    examiner: current.examiner,
    role,
    isAdmin: role === 'super_admin' || role === 'admin',
    isSuper: role === 'super_admin',
    isExaminer: role === 'examiner',
    ready: session !== undefined && (!userId || loaded.uid === userId),
    can,
    signIn,
    signOut,
    reloadProfile: () => userId && loadProfile(userId),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
