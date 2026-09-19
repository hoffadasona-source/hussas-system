// GitHub Pages لا يدعم إعادة توجيه المسارات: نسخة من index.html باسم 404.html تجعل
// الروابط المباشرة (مثل /certificate-verification?no=… من رمز QR) تفتح التطبيق بدل صفحة خطأ.
import fs from 'node:fs';

fs.copyFileSync('dist/index.html', 'dist/404.html');
fs.writeFileSync('dist/.nojekyll', '');
console.log('✓ dist/404.html و dist/.nojekyll جاهزان لـ GitHub Pages');
