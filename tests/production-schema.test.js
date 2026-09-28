import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
test('migration runs against the verified production structure without losing records',async()=>{
  const db=new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      grant usage on schema public,auth to anon,authenticated;
      create function auth.jwt() returns jsonb language sql as $$select '{}'::jsonb$$;
      create function auth.uid() returns uuid language sql as $$select null::uuid$$;`);
    await db.exec(readFileSync(new URL('./fixtures/production-schema.sql',import.meta.url),'utf8'));
    await db.exec(`insert into clientes(nombres,apellidos,numero_cedula,telefono_1,correo_electronico) values('Test','Client','test-id','test-phone','test@example.com');
      insert into obras(id_obra,cliente_id,categoria_obra,slug_tracking) select '#TEST',id,'Cocina','old123' from clientes;`);
    await db.exec(readFileSync(new URL('../supabase/migrations/20260928_security.sql',import.meta.url),'utf8'));
    assert.equal(Number((await db.query('select count(*) from obras')).rows[0].count),1);
    assert.equal((await db.query('select old_token from private.tracking_token_backup')).rows[0].old_token,'old123');
    const rows=(await db.query("select relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'")).rows;
    assert.equal(rows.length,5);assert.ok(rows.every(r=>r.relrowsecurity));
    await db.exec('set role anon');
    await assert.rejects(db.query('select * from private.tracking_token_backup'),/permission denied/);
    await db.exec('reset role; set role authenticated');
    assert.equal(Number((await db.query('select count(*) from obras')).rows[0].count),0);
    assert.equal((await db.query("select has_table_privilege('authenticated','public.obras','TRUNCATE') as allowed")).rows[0].allowed,false);
  } finally {await db.close();}
});
