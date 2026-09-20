// يتحقق أن كل ما تستعمله الواجهة من قاعدة البيانات موجود فعلاً في المخطط:
// الجداول والعروض، وأسماء الأعمدة في select، وأسماء الإجراءات (RPC) ومعاملاتها وصلاحيات تنفيذها.
// يمنع تكرار أخطاء مثل: عمود حُذف من عرض، أو إجراء تغيّرت أسماء معاملاته، أو جدول أُلغي.
// التشغيل: npm run test:usage
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bootDb } from './pglite.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const db = await bootDb({ quiet: true });

let failures = 0;
const ok = (cond, msg) => {
  console.log(`  ${cond ? '✓' : '✗'} ${msg}`);
  if (!cond) failures++;
};

// ---------- قراءة ملفات الواجهة ----------
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : /\.(jsx?|mjs)$/.test(e.name) ? [p] : [];
  });
}
const files = [...walk(path.join(ROOT, 'src')), ...walk(path.join(ROOT, 'scripts'))];
const sources = files.map((f) => ({ file: path.relative(ROOT, f), code: fs.readFileSync(f, 'utf8') }));

// ---------- المخطط ----------
const relations = new Map(); // اسم العلاقة → مجموعة الأعمدة
for (const r of (await db.query(`
  select table_name, array_agg(column_name) cols
  from information_schema.columns where table_schema = 'public'
  group by table_name`)).rows) {
  relations.set(r.table_name, new Set(r.cols));
}

const functions = new Map(); // اسم الدالة → { args, acl }
for (const r of (await db.query(`
  select p.proname,
         coalesce(p.proargnames, '{}') args,
         coalesce(array_to_string(p.proacl, ' '), '') acl
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'`)).rows) {
  functions.set(r.proname, { args: r.args, acl: r.acl });
}

// إجراءات تُستدعى من الخادم فقط أو من سكربتات الصيانة
const SERVER_ONLY = new Set(['claim_messages', 'finish_message']);

console.log('— الجداول والعروض المستعملة في الواجهة');
const usedRelations = new Map();
for (const { file, code } of sources) {
  for (const m of code.matchAll(/\.from\('([a-z_0-9]+)'\)/g)) {
    if (!usedRelations.has(m[1])) usedRelations.set(m[1], new Set());
    usedRelations.get(m[1]).add(file);
  }
}
for (const [rel, where] of [...usedRelations].sort()) {
  // storage.from('branding') يخص التخزين لا قاعدة البيانات
  if (rel === 'branding') continue;
  ok(relations.has(rel), `${rel} — ${[...where].join('، ')}`);
}

console.log('\n— الأعمدة في استعلامات select');
const IGNORE_TOKENS = new Set(['*', 'count', 'exact', 'head', 'true']);
for (const { file, code } of sources) {
  for (const m of code.matchAll(/\.from\('([a-z_0-9]+)'\)\s*\n?\s*\.select\('([^']*)'/g)) {
    const [, rel, sel] = m;
    const cols = relations.get(rel);
    if (!cols) continue;
    const bad = sel
      .split(',')
      .map((c) => c.trim().split(':').pop().trim())
      .filter((c) => c && !IGNORE_TOKENS.has(c) && !c.includes('(') && !cols.has(c));
    ok(bad.length === 0, `${rel} في ${file}${bad.length ? ` — أعمدة غير موجودة: ${bad.join('، ')}` : ''}`);
  }
}

console.log('\n— أعمدة القوائم المرقّمة (usePagedList/useCount)');
for (const { file, code } of sources) {
  // usePagedList({ ... source: 'v_x' ... }) — نقرأ الكتلة حتى إغلاقها التقريبي
  for (const m of code.matchAll(/usePagedList\(\{([\s\S]*?)\n\s*\}\)/g)) {
    const block = m[1];
    const rel = block.match(/source:\s*'([a-z_0-9]+)'/)?.[1];
    if (!rel) continue; // تعريف الدالة نفسها في hooks/data.js لا استدعاؤها
    const cols = relations.get(rel);
    if (!cols) {
      ok(false, `${file}: مصدر غير معروف ${rel}`);
      continue;
    }
    const used = new Set();
    // المفتاح هو ما قبل أول «:» في كل عنصر، حتى لا تُلتقط قيم الشرط الثلاثي
    for (const entry of (block.match(/filters:\s*\{([^}]*)\}/)?.[1] || '').split(',')) {
      const key = entry.match(/^\s*([a-z_0-9]+)\s*:/)?.[1] || entry.trim().match(/^([a-z_0-9]+)$/)?.[1];
      if (key) used.add(key);
    }
    for (const c of block.match(/searchCols:\s*\[([^\]]*)\]/)?.[1]?.matchAll(/'([a-z_0-9]+)'/g) || []) used.add(c[1]);
    const orderCol = block.match(/order:\s*\['([a-z_0-9]+)'/)?.[1];
    if (orderCol) used.add(orderCol);
    else used.add('created_at'); // الترتيب الافتراضي في usePagedList
    const selects = block.match(/select:\s*'([^']*)'/)?.[1];
    if (selects) for (const c of selects.split(',')) used.add(c.trim().split(':').pop().trim());
    const bad = [...used].filter((c) => c && c !== '*' && !cols.has(c));
    ok(bad.length === 0, `${rel} في ${file}${bad.length ? ` — أعمدة غير موجودة: ${bad.join('، ')}` : ''}`);
  }
  // useCount('key', 'relation', (q) => q.eq('col', ...))
  for (const m of code.matchAll(/useCount\('[a-zA-Z]+',\s*'([a-z_0-9]+)',\s*\(q\) => q\.[a-z]+\('([a-z_0-9]+)'/g)) {
    const cols = relations.get(m[1]);
    ok(!!cols && cols.has(m[2]), `useCount على ${m[1]}.${m[2]} — ${file}`);
  }
}

console.log('\n— الإجراءات (RPC) ومعاملاتها');
const usedRpc = new Map();
for (const { file, code } of sources) {
  // rpc('name', { p_x: ... }) في lib/supabase.js أو supabase.rpc(...)
  for (const m of code.matchAll(/\brpc\(\s*'([a-z_0-9]+)'\s*(?:,\s*\{([^}]*)\})?/g)) {
    const [, fn, argsRaw = ''] = m;
    const args = [...argsRaw.matchAll(/([a-z_0-9]+)\s*:/g)].map((a) => a[1]);
    if (!usedRpc.has(fn)) usedRpc.set(fn, { files: new Set(), calls: [] });
    usedRpc.get(fn).files.add(file);
    usedRpc.get(fn).calls.push(args);
  }
}
for (const [fn, { files: where, calls }] of [...usedRpc].sort()) {
  const def = functions.get(fn);
  if (!ok(!!def, `${fn} موجود — ${[...where].join('، ')}`)) continue;
  const known = new Set(def.args);
  const unknown = [...new Set(calls.flat())].filter((a) => !known.has(a));
  ok(unknown.length === 0, `${fn}: أسماء المعاملات${unknown.length ? ` — غير معروفة: ${unknown.join('، ')}` : ' صحيحة'}`);
  const callable = /anon=|authenticated=/.test(def.acl);
  ok(callable || SERVER_ONLY.has(fn), `${fn}: ممنوح لتنفيذ الواجهة`);
}

console.log('\n— لا تنفيذ عام لأي دالة (public)');
const publicExec = (await db.query(`
  select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and (p.proacl is null or array_to_string(p.proacl, ' ') like '%=X/%' and array_to_string(p.proacl, ' ') ~ '(^| )=X/')`)).rows;
ok(publicExec.length === 0, publicExec.length ? `دوال متاحة للجميع: ${publicExec.map((r) => r.proname).join('، ')}` : 'كل الدوال محصورة بأدوار محددة');

console.log('\n— أمان المخطط');
const noRls = (await db.query(`
  select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`)).rows;
ok(noRls.length === 0, noRls.length ? `جداول بلا RLS: ${noRls.map((r) => r.relname).join('، ')}` : 'RLS مفعّل على كل الجداول');

const anonWrite = (await db.query(`
  select table_name, string_agg(distinct privilege_type, ',') p
  from information_schema.role_table_grants
  where grantee = 'anon' and table_schema = 'public'
  group by table_name having string_agg(distinct privilege_type, ',') <> 'SELECT'`)).rows;
ok(anonWrite.length === 0, anonWrite.length
  ? `للزائر صلاحيات كتابة: ${anonWrite.map((r) => `${r.table_name}(${r.p})`).join('، ')}`
  : 'الزائر لا يملك إلا القراءة على القوائم العامة');

const viewWrite = (await db.query(`
  select table_name, string_agg(distinct privilege_type, ',') p
  from information_schema.role_table_grants g
  join pg_class c on c.relname = g.table_name
  join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
  where g.grantee = 'authenticated' and g.table_schema = 'public' and c.relkind = 'v'
    and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
  group by table_name`)).rows;
ok(viewWrite.length === 0, viewWrite.length
  ? `كتابة عبر العروض للمستخدم المسجَّل: ${viewWrite.map((r) => `${r.table_name}(${r.p})`).join('، ')}`
  : 'العروض للقراءة فقط');

const openViews = (await db.query(`
  select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'v'
    and coalesce((select option_value from pg_options_to_table(c.reloptions)
                  where option_name = 'security_invoker'), 'false') <> 'true'`)).rows;
ok(openViews.length === 0, openViews.length
  ? `عروض بلا security_invoker: ${openViews.map((r) => r.relname).join('، ')}`
  : 'كل العروض تطبّق صلاحيات المستخدم (security_invoker)');

console.log('\n— لا أثر للمفاهيم الملغاة في الشيفرة');
for (const [word, label] of [['matn', 'المتون'], ['cycle_id', 'الدورات'], ['must_change_password', 'إجبار تغيير كلمة المرور']]) {
  const hits = sources.filter(({ code }) => new RegExp(word, 'i').test(code)).map((s) => s.file);
  ok(hits.length === 0, `${label}: ${hits.length ? hits.join('، ') : 'لا توجد إشارات'}`);
}

console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
process.exit(failures ? 1 : 0);
