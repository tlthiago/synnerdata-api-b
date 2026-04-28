/**
 * Side-effect module — configures Zod v4 default locale to PT-BR on load.
 *
 * Import once at the top of src/index.ts before any schema is parsed.
 * No exports — the effect is registering the locale with Zod's global
 * config. Every subsequent `z.string().email()` etc. emits messages in PT-BR.
 *
 * To override per-schema, pass a custom `error` option at the call site.
 */
import { z } from "zod";

z.config(z.locales.pt());
