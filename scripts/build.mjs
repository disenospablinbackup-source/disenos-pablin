import { mkdir, copyFile } from 'node:fs/promises';
await mkdir('public', { recursive: true });
for (const file of ['index.html', 'tracking.html', 'correos.html']) await copyFile(file, 'public/' + file);
await copyFile('node_modules/@supabase/supabase-js/dist/umd/supabase.js', 'public/supabase.js');
