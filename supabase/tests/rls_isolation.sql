-- Prova de isolamento da RLS do modelo clínico.
--
--   docker exec -i supabase_db_InfraJoint psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f - < supabase/tests/rls_isolation.sql
--
-- Roda contra o banco LOCAL. Qualquer assert que falhe aborta o script com
-- código de saída não-zero.
--
-- O que ele prova:
--   1. Médico A não enxerga nada do médico B
--   2. inherit_owner ignora o owner_id enviado pelo cliente
--   3. Não dá para pendurar uma consulta no paciente de outro médico
--   4. Leitor ('user') não cria paciente
--   5. Admin enxerga os dois médicos
--   6. Não dá para reparentar uma linha para o tenant de outro médico
--   7. Médico rebaixado vira somente-leitura (não apaga)
--   8. As funções de autorização são totais — nunca devolvem NULL
--   9. Tabela nova não nasce acessível ao anon
--  10. anon não alcança as tabelas

\set ON_ERROR_STOP on
\set QUIET on

-- ─────────────────────────────────────────────────────────────────────────────
-- Cenário: 2 médicos, 1 leitor, 1 admin. Ids fixos para o script ser relegível.
-- ─────────────────────────────────────────────────────────────────────────────
begin;

delete from public.patients where full_name like 'RLS-TEST%';

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data) values
  ('aaaaaaaa-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','rlstest-a@local','{"full_name":"Medico A"}'),
  ('bbbbbbbb-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','rlstest-b@local','{"full_name":"Medico B"}'),
  ('cccccccc-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','rlstest-l@local','{"full_name":"Leitor"}'),
  ('dddddddd-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','rlstest-x@local','{"full_name":"Admin"}')
on conflict (id) do nothing;

update public.users set role = 'medico' where id in
  ('aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000002');
update public.users set role = 'user'  where id = 'cccccccc-0000-0000-0000-000000000003';
update public.users set role = 'admin' where id = 'dddddddd-0000-0000-0000-000000000004';

commit;

-- ─────────────────────────────────────────────────────────────────────────────
\echo '1. Médico A cria paciente e consulta — e o owner_id enviado é ignorado'
-- ─────────────────────────────────────────────────────────────────────────────
begin;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);

-- owner_id vai de propósito com o uuid do médico B: o trigger tem que descartar.
insert into public.patients (id, owner_id, full_name)
values ('11111111-aaaa-0000-0000-000000000001',
        'bbbbbbbb-0000-0000-0000-000000000002', 'RLS-TEST paciente de A');

insert into public.encounters (id, patient_id, owner_id, reason)
values ('22222222-aaaa-0000-0000-000000000001',
        '11111111-aaaa-0000-0000-000000000001',
        'bbbbbbbb-0000-0000-0000-000000000002', 'RLS-TEST consulta');

do $$
declare dono uuid; dono_enc uuid; autor uuid;
begin
  select owner_id into dono     from public.patients   where full_name = 'RLS-TEST paciente de A';
  select owner_id, created_by into dono_enc, autor
    from public.encounters where id = '22222222-aaaa-0000-0000-000000000001';

  assert dono = 'aaaaaaaa-0000-0000-0000-000000000001',
    format('own_row deveria ter forçado o dono para A, veio %s', dono);
  assert dono_enc = 'aaaaaaaa-0000-0000-0000-000000000001',
    format('inherit_owner deveria ter copiado o dono do paciente, veio %s', dono_enc);
  assert autor = 'aaaaaaaa-0000-0000-0000-000000000001',
    format('created_by deveria vir de auth.uid(), veio %s', autor);
end $$;
commit;

-- ─────────────────────────────────────────────────────────────────────────────
\echo '2. Médico B não enxerga nem alcança nada de A'
-- ─────────────────────────────────────────────────────────────────────────────
begin;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"bbbbbbbb-0000-0000-0000-000000000002","role":"authenticated"}', true);

do $$
declare n int;
begin
  select count(*) into n from public.patients where full_name like 'RLS-TEST%';
  assert n = 0, format('B deveria ver 0 pacientes de A, viu %s', n);

  select count(*) into n from public.encounters;
  assert n = 0, format('B deveria ver 0 consultas, viu %s', n);

  -- Buscar pelo id exato também não revela nada: é isso que vira 404 na API.
  select count(*) into n from public.patients
   where id = '11111111-aaaa-0000-0000-000000000001';
  assert n = 0, 'B alcançou o paciente de A pelo id — a API responderia 200 em vez de 404';
end $$;

-- E não consegue pendurar uma consulta no paciente de A: o pai está invisível,
-- então o inherit_owner não acha a linha e aborta.
do $$
begin
  begin
    insert into public.encounters (patient_id, reason)
    values ('11111111-aaaa-0000-0000-000000000001', 'RLS-TEST invasao');
    raise exception 'FALHA: B criou consulta no paciente de A';
  exception when insufficient_privilege then
    null;  -- esperado
  end;
end $$;
commit;

-- ─────────────────────────────────────────────────────────────────────────────
\echo '3. Leitor não cria paciente'
-- ─────────────────────────────────────────────────────────────────────────────
begin;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"cccccccc-0000-0000-0000-000000000003","role":"authenticated"}', true);

do $$
begin
  begin
    insert into public.patients (full_name) values ('RLS-TEST paciente do leitor');
    raise exception 'FALHA: leitor criou paciente';
  exception when insufficient_privilege then
    null;  -- WITH CHECK exige role medico/admin
  end;
end $$;
commit;

-- ─────────────────────────────────────────────────────────────────────────────
\echo '4. Médico B cria o seu, e cada um continua vendo só o próprio'
-- ─────────────────────────────────────────────────────────────────────────────
begin;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"bbbbbbbb-0000-0000-0000-000000000002","role":"authenticated"}', true);
insert into public.patients (full_name) values ('RLS-TEST paciente de B');

do $$
declare n int;
begin
  select count(*) into n from public.patients where full_name like 'RLS-TEST%';
  assert n = 1, format('B deveria ver só o próprio paciente, viu %s', n);
end $$;
commit;

-- ─────────────────────────────────────────────────────────────────────────────
\echo '5. Admin enxerga os dois'
-- ─────────────────────────────────────────────────────────────────────────────
begin;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"dddddddd-0000-0000-0000-000000000004","role":"authenticated"}', true);

do $$
declare n int;
begin
  select count(*) into n from public.patients where full_name like 'RLS-TEST%';
  assert n = 2, format('admin deveria ver os 2 pacientes, viu %s', n);

  select count(*) into n from public.encounters;
  assert n = 1, format('admin deveria ver a consulta de A, viu %s', n);
end $$;
commit;

-- ─────────────────────────────────────────────────────────────────────────────
\echo '5b. Admin lê a consulta de A, mas não escreve nela'
-- ─────────────────────────────────────────────────────────────────────────────
-- Consulta é do dono do paciente. O admin supervisiona (a policy _read continua com
-- can_access) e não assina no lugar de quem atendeu (a _write exige owner_id =
-- auth.uid()). Sem esta separação, a consulta nascia com owner do médico e
-- created_by do admin — um registro clínico assinado por quem não atendeu.
begin;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"dddddddd-0000-0000-0000-000000000004","role":"authenticated"}', true);
do $$
declare n int;
begin
  select count(*) into n from public.encounters
   where id = '22222222-aaaa-0000-0000-000000000001';
  assert n = 1, 'admin deveria continuar LENDO a consulta de A';

  begin
    insert into public.encounters (patient_id, reason)
    values ('11111111-aaaa-0000-0000-000000000001', 'RLS-TEST consulta do admin');
    raise exception 'FALHA: admin registrou consulta no paciente de A';
  exception when insufficient_privilege then
    null;  -- encounters_write exige owner_id = auth.uid()
  end;

  begin
    update public.encounters set reason = 'RLS-TEST editada pelo admin'
     where id = '22222222-aaaa-0000-0000-000000000001';
    assert not found, 'FALHA: admin editou a consulta de A';
  exception when insufficient_privilege then
    null;
  end;
end $$;
commit;

-- ─────────────────────────────────────────────────────────────────────────────
\echo '6. A não consegue reparentar a própria consulta para o paciente de B'
-- ─────────────────────────────────────────────────────────────────────────────
-- Regressão: com o trigger só em BEFORE INSERT, este UPDATE passava. O owner_id
-- não mudava, então a policy continuava satisfeita — e a consulta de A ficava
-- pendurada no paciente de B. Quando B apagasse o paciente, o ON DELETE CASCADE
-- levaria a consulta de A junto.
begin;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"bbbbbbbb-0000-0000-0000-000000000002","role":"authenticated"}', true);
insert into public.patients (id, full_name)
values ('11111111-bbbb-0000-0000-000000000002', 'RLS-TEST paciente de B2');
commit;

begin;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);
do $$
begin
  begin
    update public.encounters
       set patient_id = '11111111-bbbb-0000-0000-000000000002'
     where id = '22222222-aaaa-0000-0000-000000000001';
    raise exception 'FALHA: A reparentou a consulta para o paciente de B';
  exception when insufficient_privilege then
    null;  -- inherit_owner não achou o pai sob a RLS de A
  end;
end $$;
commit;

-- ─────────────────────────────────────────────────────────────────────────────
\echo '7. Médico rebaixado a leitor fica somente-leitura (não apaga)'
-- ─────────────────────────────────────────────────────────────────────────────
-- Regressão: com uma policy única `for all`, o DELETE consultava apenas o USING,
-- que não checava role. O rebaixado não podia editar e podia apagar.
begin;
update public.users set role = 'user' where id = 'aaaaaaaa-0000-0000-0000-000000000001';
commit;

begin;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);
do $$
declare n int;
begin
  select count(*) into n from public.patients where full_name = 'RLS-TEST paciente de A';
  assert n = 1, 'rebaixado deveria continuar LENDO o próprio histórico';

  delete from public.patients where full_name = 'RLS-TEST paciente de A';
  select count(*) into n from public.patients where full_name = 'RLS-TEST paciente de A';
  assert n = 1, 'FALHA: leitor rebaixado APAGOU o próprio paciente';
end $$;
commit;

begin;
update public.users set role = 'medico' where id = 'aaaaaaaa-0000-0000-0000-000000000001';
commit;

-- ─────────────────────────────────────────────────────────────────────────────
\echo '8. Funções de autorização são totais (nunca NULL)'
-- ─────────────────────────────────────────────────────────────────────────────
begin;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"99999999-9999-9999-9999-999999999999","role":"authenticated"}', true);
do $$
begin
  assert app.is_admin()     is not null, 'is_admin() devolveu NULL para uid sem perfil';
  assert app.is_clinician() is not null, 'is_clinician() devolveu NULL para uid sem perfil';
  assert app.can_access('99999999-9999-9999-9999-999999999999') is not null,
    'can_access() devolveu NULL';
  assert app.is_admin() = false and app.is_clinician() = false,
    'uid sem perfil não deveria ser admin nem clínico';
end $$;
commit;

-- ─────────────────────────────────────────────────────────────────────────────
\echo '9. Tabela nova não nasce acessível ao anon'
-- ─────────────────────────────────────────────────────────────────────────────
begin;
create table public.rls_test_tabela_nova (id int);
do $$
declare n int;
begin
  select count(*) into n from information_schema.role_table_grants
   where grantee = 'anon' and table_name = 'rls_test_tabela_nova';
  assert n = 0, format('tabela nova nasceu com %s grants para o anon', n);
end $$;
rollback;

-- ─────────────────────────────────────────────────────────────────────────────
\echo '10. anon não alcança as tabelas'
-- ─────────────────────────────────────────────────────────────────────────────
begin;
set local role anon;
do $$
begin
  begin
    perform count(*) from public.patients;
    raise exception 'FALHA: anon leu public.patients';
  exception when insufficient_privilege then
    null;  -- o revoke do §6 da migration
  end;
end $$;
commit;

-- ─────────────────────────────────────────────────────────────────────────────
begin;
delete from public.patients where full_name like 'RLS-TEST%';
commit;

\echo ''
\echo 'rls_isolation: todos os cenários passaram.'
