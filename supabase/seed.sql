-- Contas de desenvolvimento LOCAL, com senha, uma por papel.
--
-- Carregado automaticamente pelo `supabase db reset`, depois das migrations. Nunca vai
-- para produção: o `supabase db push` só envia supabase/migrations/.
--
--   medico-a@local.test   SenhaLocal123!   medico
--   medico-b@local.test   SenhaLocal123!   medico   (para provar o isolamento entre médicos)
--   leitor@local.test     SenhaLocal123!   user     (vê a demo, não salva)
--   admin@local.test      SenhaLocal123!   admin
--
-- A senha é fraca de propósito e está versionada de propósito: estas contas só existem
-- no Postgres do seu Docker, que escuta em 127.0.0.1.

do $$
declare
  conta        record;
  senha_hash   text := crypt('SenhaLocal123!', gen_salt('bf'));
  contas       constant jsonb := '[
    {"id":"11111111-0000-4000-8000-000000000001","email":"medico-a@local.test","nome":"Dra. Alice Medeiros","papel":"medico"},
    {"id":"22222222-0000-4000-8000-000000000002","email":"medico-b@local.test","nome":"Dr. Bruno Tavares","papel":"medico"},
    {"id":"33333333-0000-4000-8000-000000000003","email":"leitor@local.test","nome":"Leitor Demo","papel":"user"},
    {"id":"44444444-0000-4000-8000-000000000004","email":"admin@local.test","nome":"Admin InfraJoint","papel":"admin"}
  ]';
begin
  for conta in select * from jsonb_to_recordset(contas)
                 as x(id uuid, email text, nome text, papel text)
  loop
    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at
    )
    values (
      conta.id, '00000000-0000-0000-0000-000000000000',
      'authenticated', 'authenticated', conta.email, senha_hash,
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', conta.nome),
      now(), now()
    )
    on conflict (id) do nothing;

    -- As colunas de token são NULL por padrão, mas o GoTrue as lê como string não
    -- anulável em Go. Deixá-las nulas faz o login morrer com um erro que não ajuda:
    -- "Database error querying schema" (o detalhe real só aparece no log do container).
    update auth.users
       set confirmation_token = '', recovery_token = '',
           email_change_token_new = '', email_change = '',
           email_change_token_current = '', reauthentication_token = '',
           phone_change = '', phone_change_token = ''
     where id = conta.id;

    -- Sem a identity o GoTrue não encontra o provedor 'email' e o login falha.
    insert into auth.identities (
      id, provider_id, user_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at
    )
    values (
      gen_random_uuid(), conta.id::text, conta.id,
      jsonb_build_object('sub', conta.id::text, 'email', conta.email,
                         'email_verified', true, 'phone_verified', false),
      'email', now(), now(), now()
    )
    on conflict do nothing;

    -- public.users é criado pelo trigger on_auth_user_created; aqui só o papel.
    update public.users set role = conta.papel::public.user_role where id = conta.id;
  end loop;
end
$$;
