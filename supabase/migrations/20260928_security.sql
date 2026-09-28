-- Apply only after backup and staging verification against the real schema.
-- Existing short tracking links are rotated: redistribute the new links.
begin;
create schema if not exists private;
revoke all on schema private from public;
create table if not exists private.admin_quota (
  user_id uuid not null, action_name text not null, window_start timestamptz not null,
  requests integer not null, primary key(user_id, action_name)
);

-- Remove permissive legacy policies before installing the admin-only boundary.
do $$
declare p record; t text;
begin
  foreach t in array array['clientes','tecnicos','obras'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    for p in select policyname from pg_policies where schemaname='public' and tablename=t loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;
    execute format(
      'create policy admin_only on public.%I for all to authenticated using ((auth.jwt()->''app_metadata''->>''role'') = ''admin'') with check ((auth.jwt()->''app_metadata''->>''role'') = ''admin'')', t
    );
  end loop;
end $$;

update public.obras set slug_tracking = replace(gen_random_uuid()::text, '-', '')
where slug_tracking is null or slug_tracking !~ '^[a-f0-9]{32,64}$';
create unique index if not exists obras_tracking_unique on public.obras(slug_tracking);

create or replace function public.consume_admin_quota(action_name text)
returns boolean language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare used integer; bucket timestamptz := date_trunc('minute', now());
begin
  if auth.uid() is null or coalesce(auth.jwt()->'app_metadata'->>'role','') <> 'admin'
     or action_name not in ('email', 'bot') then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  insert into private.admin_quota as q values (auth.uid(), action_name, bucket, 1)
  on conflict (user_id, action_name) do update
    set requests = case when q.window_start = excluded.window_start then least(q.requests + 1, 11) else 1 end,
        window_start = excluded.window_start
  returning requests into used;
  return used <= 10;
end $$;
revoke all on function public.consume_admin_quota(text) from public, anon;
grant execute on function public.consume_admin_quota(text) to authenticated;

create or replace function public.get_public_tracking(tracking_token text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id_obra', o.id_obra, 'categoria_obra', o.categoria_obra, 'fase_actual', o.fase_actual,
    'porcentaje_avance', o.porcentaje_avance, 'estado', o.estado,
    'fecha_entrega_estimada', o.fecha_entrega_estimada,
    'calificacion_estrellas', o.calificacion_estrellas,
    'resena_comentario', o.resena_comentario,
    'clientes', jsonb_build_object('nombres', c.nombres),
    'tecnicos', jsonb_build_object('nombres', t.nombres)
  )
  from public.obras o
  left join public.clientes c on c.id = o.cliente_id
  left join public.tecnicos t on t.id = o.tecnico_id
  where tracking_token ~ '^[a-f0-9]{32,64}$' and o.slug_tracking = tracking_token
  limit 1;
$$;
revoke all on function public.get_public_tracking(text) from public;
grant execute on function public.get_public_tracking(text) to anon, authenticated;

create or replace function public.submit_tracking_review(tracking_token text, stars integer, comment text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare updated integer;
begin
  if tracking_token !~ '^[a-f0-9]{32,64}$' or tracking_token is null
     or stars is null or stars not between 1 and 5 or comment is null or length(comment) > 2000 then
    raise exception 'Invalid review' using errcode = '22023';
  end if;
  update public.obras set calificacion_estrellas = stars, resena_comentario = comment, resena_fecha = now()
  where slug_tracking = tracking_token and calificacion_estrellas is null
    and (porcentaje_avance >= 100 or fase_actual = 'Entrega' or estado = 'Finalizada');
  get diagnostics updated = row_count;
  if updated = 0 then return null; end if;
  return jsonb_build_object('success', true);
end $$;
revoke all on function public.submit_tracking_review(text, integer, text) from public;
grant execute on function public.submit_tracking_review(text, integer, text) to anon, authenticated;
commit;
