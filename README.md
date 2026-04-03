# Premio Semanal - App Publico

## Seguranca de deploy

Este projeto e um frontend publico em Vite. Por isso:

- Tudo que comeca com `VITE_` vai para o bundle do navegador.
- `VITE_SUPABASE_URL` e a `VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY` sao publicos e podem aparecer no client.
- Segredos privados nao podem ficar neste app nem em arquivos usados pelo build do frontend.

Nunca coloque neste projeto:

- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ACCESS_TOKEN`
- `MERCADO_PAGO_ACCESS_TOKEN`

Esses segredos devem ficar apenas:

- nas Edge Functions do Supabase
- em variaveis de ambiente do servidor, nunca no frontend

## O que servir em producao

Em producao, publique apenas a pasta `dist/`.

Nao exponha pela web:

- a raiz do projeto
- arquivos `.env`
- pasta `supabase/`
- `node_modules/`

## Variaveis seguras para o frontend

Use `.env.example` como referencia. Para este app publico, o esperado e algo como:

- `VITE_SUPABASE_PROJECT_ID`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY`
- `VITE_PUBLIC_APP_URL`

## Servidor de producao local

O projeto agora possui um servidor estatico proprio para a pasta `dist`:

- arquivo: `scripts/serve-dist.mjs`
- porta padrao: `4173`

Scripts disponiveis:

- `npm run build:prod`
- `npm run start:prod`
- `npm run start:prod:windows`
- `npm run stop:prod:windows`

Os logs e PIDs ficam em `.runtime/`.

## Deploy na Vercel

Para subir na Vercel, publique o app `premiosemanal-main` como projeto Vite e configure no painel da Vercel:

- `VITE_SUPABASE_PROJECT_ID`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY`
- `VITE_PUBLIC_APP_URL`

Use como valor de `VITE_PUBLIC_APP_URL` o dominio final do app, por exemplo:

- `https://seu-projeto.vercel.app`
