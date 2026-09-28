import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

test('migration restricts tables, limits tracking, protects reviews and enforces quotas', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth;
      grant usage on schema auth, public to anon, authenticated;
      create function auth.jwt() returns jsonb language sql as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
      create function auth.uid() returns uuid language sql as $$ select (auth.jwt()->>'sub')::uuid $$;
      create table clientes(id uuid primary key, nombres text, apellidos text, correo_electronico text, numero_cedula text);
      create table tecnicos(id uuid primary key, nombres text, telefono_1 text);
      create table obras(id uuid primary key, cliente_id uuid, tecnico_id uuid, id_obra text, categoria_obra text, fase_actual text, porcentaje_avance integer, estado text, fecha_entrega_estimada date, calificacion_estrellas integer, resena_comentario text, resena_fecha timestamptz, slug_tracking text, descripcion text);
      insert into clientes values ('11111111-1111-4111-8111-111111111111','Cliente','Privado','private@example.com','private-id');
      insert into obras values ('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111',null,'OBR-1','Cocina','Entrega',100,'Finalizada',null,null,null,null,'abc123','private internal note');
      grant all on clientes, tecnicos, obras to anon, authenticated;
      create policy old_public on obras for all to public using (true) with check (true);
    `);
    await db.exec(readFileSync(new URL('../supabase/migrations/20260928_security.sql',import.meta.url),'utf8'));
    const token=(await db.query('select slug_tracking from obras')).rows[0].slug_tracking;
    assert.match(token,/^[a-f0-9]{32}$/);
    await db.exec('set role anon');
    await assert.rejects(db.query('select * from clientes'), /permission denied/);
    await assert.rejects(db.query("update obras set fase_actual='Diseño'"), /permission denied/);
    const payload=(await db.query('select get_public_tracking($1) as data',[token])).rows[0].data;
    assert.equal(payload.clientes.nombres,'Cliente');
    assert.ok(!JSON.stringify(payload).includes('private'));
    assert.equal(payload.id,undefined);
    assert.equal((await db.query("select get_public_tracking('abc123') as data")).rows[0].data,null);
    await assert.rejects(db.query('select submit_tracking_review($1,6,$2)',[token,'bad']),/Invalid review/);
    assert.deepEqual((await db.query('select submit_tracking_review($1,5,$2) as data',[token,'Good'])).rows[0].data,{success:true});
    assert.equal((await db.query('select submit_tracking_review($1,1,$2) as data',[token,'Overwrite'])).rows[0].data,null);
    await db.exec('reset role; set role authenticated');
    assert.equal((await db.query('select * from obras')).rows.length,0);
    await assert.rejects(db.query("select consume_admin_quota('email')"),/Forbidden/);
    await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:'33333333-3333-4333-8333-333333333333',app_metadata:{role:'admin'}})]);
    assert.equal((await db.query('select * from obras')).rows.length,1);
    for(let i=0;i<10;i++) assert.equal((await db.query("select consume_admin_quota('email') as allowed")).rows[0].allowed,true);
    assert.equal((await db.query("select consume_admin_quota('email') as allowed")).rows[0].allowed,false);
    assert.equal((await db.query("select consume_admin_quota('bot') as allowed")).rows[0].allowed,true);
  } finally { await db.close(); }
});
