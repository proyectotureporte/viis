# VIIS — OpenV

Landing full-stack de OpenV para captación y acompañamiento en créditos de vivienda. Conserva el diseño y la calculadora del sitio original y convierte cada llamada a la acción en una solicitud persistida en PostgreSQL.

## Desarrollo

```bash
cp .env.example .env
pnpm install
pnpm db:migrate:deploy
pnpm dev
```

Verificación completa:

```bash
pnpm check
```

Consulta `AGENTS.md` y `docs/PROJECT-MAP.md` para conocer la arquitectura y las reglas del proyecto.
