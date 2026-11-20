# Plano: leitura de recibos brasileiros com LLM

Projeto de estudo e implementação para ler imagens de recibos brasileiros, extrair dados básicos com um LLM e devolver o resultado em JSON.

**Status:** Fases 0 e 1 concluídas. A Fase 2 ainda não foi iniciada. Em 19/11/2026, o escopo mudou: a biblioteca não salva mais nada (nem banco, nem imagens) e só devolve o resultado. Também mudou o foco: o mercado brasileiro vem primeiro, e o americano fica no roadmap.

## Escopo

**Dentro do escopo:**
- Verificar se a imagem é um recibo.
- Documentos validados: **cupom não fiscal** e **comprovante de maquininha** de cartão.
- Extrair comerciante, data, subtotal, imposto, gorjeta e total, quando aparecerem no documento.
- Devolver o resultado em JSON, com os valores brutos e os normalizados.
- Medir a qualidade com evals e estudar práticas de mercado.

**Fora do escopo:**
- Validar se o recibo é verdadeiro. O sistema transcreve o que a imagem mostra.
- Cruzar dados com transações, categorizar despesas ou verificar requisitos fiscais.
- Extrair os itens do recibo, por enquanto.
- Salvar resultados ou imagens. Quem chama a biblioteca decide se e onde guardar.
- Revisão humana. Fica no sistema que consumir o resultado.
- Suporte a múltiplas empresas, por enquanto.
- Recibos de outros países, por enquanto. O mercado americano está no roadmap.
- Extrair o CPF ou outros números de documento pessoal do consumidor, como RG e CNH. O modelo deve ignorá-los (LGPD).

## Decisões

| Tema | Decisão |
|---|---|
| Projeto | Novo repositório `receipt-reader`, separado deste |
| Formato | Biblioteca que devolve JSON, com uma CLI que imprime esse JSON |
| Persistência | Nenhuma. A biblioteca não grava em banco nem salva imagens |
| Stack | Node.js 24, TypeScript e ESM |
| LLM | API da Anthropic, atrás de uma interface |
| Dependências aprovadas | `@anthropic-ai/sdk`; `zod`; `eslint`, `@eslint/js` e `typescript-eslint` (dev) |
| Mercado | Brasil primeiro. O contrato já é genérico (`currency`, data em ISO) para receber os EUA depois sem mudar o JSON |
| Documentos | Validados: cupom não fiscal e comprovante de maquininha. NFC-e e CF-e SAT também são tratados como recibo, mas sem qualidade medida |
| Campos | Todos os campos do recibo são anuláveis. Um comprovante de maquininha, por exemplo, só costuma ter o total |
| Imposto | Lido só quando aparece, como o "Valor aproximado dos tributos" (Lei 12.741). É informativo: no Brasil ele já está embutido no total |
| Gorjeta | No Brasil, é a taxa de serviço (em geral 10%, opcional) |
| CPF e documentos pessoais | Nunca extraídos. Vale para o CPF e para outros números de documento pessoal do consumidor, como RG e CNH |
| `success` | A imagem é um recibo e a extração rodou, mesmo que falte algum campo |
| Campo importante ausente | Comerciante, data ou total ausente gera um aviso em `warnings` |
| Hash | O SHA-256 do arquivo volta no JSON, para quem chamar poder deduplicar |
| Falhas | Falhas temporárias são tratadas dentro da biblioteca. Ela só lança erro quando não consegue ler o recibo |

### Princípios de leitura

- **Campo ausente:** vira `null`. O modelo não deve calcular nem inventar valores.
- **Campo ilegível:** também vira `null`, mas com um estado que o diferencia de um campo ausente.
- **Soma que não fecha:** salva o que está impresso e registra um aviso, sem corrigir. No Brasil, a conta é `subtotal + gorjeta = total`, porque o imposto já está embutido e não é somado. A divergência nem sempre é erro: um desconto também faz a soma não fechar.
- **Valor bruto e normalizado:** os dois voltam no JSON, o bruto em `raw_output` e o normalizado em `receipt`.

## Pré-requisitos

- **Chave da API:** criar no Claude Console, com créditos próprios. A assinatura do Claude Code não cobre o uso da API.
- **Limite de gastos:** definir no Console, porque os evals consomem créditos.

## Fase 0: criar o projeto

**Diferença em relação ao `response-generator`:** ele exporta `./src/index.ts`, mas o Node não remove tipos de arquivos dentro de `node_modules`. Para funcionar como biblioteca instalada, o pacote precisa publicar um build em `dist/`. Em desenvolvimento, o `.ts` continua rodando direto.

### 1. Criar a pasta

```bash
cd /Users/furlaneto/git
mkdir -p receipt-reader/src && cd receipt-reader
git init
```

### 2. Criar os arquivos

**`.nvmrc`**

```text
24
```

**`.gitignore`**

```text
node_modules/
dist/
.env
data/
```

**`CLAUDE.md`**

```text
@AGENTS.md
```

**`package.json`**

```json
{
  "name": "receipt-reader",
  "version": "0.1.0",
  "description": "Reads receipt images and extracts basic data using an LLM, returning it as JSON.",
  "type": "module",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "bin": {
    "receipt-reader": "./dist/cli.js"
  },
  "files": [
    "dist"
  ],
  "engines": {
    "node": ">=24"
  },
  "scripts": {
    "start": "node --env-file-if-exists=.env src/cli.ts",
    "build": "tsc -p tsconfig.build.json",
    "typecheck": "tsc && tsc -p tsconfig.lib.json",
    "lint": "eslint .",
    "test": "node --test",
    "check": "npm run typecheck && npm run lint && npm test",
    "prepare": "git config core.hooksPath .githooks"
  },
  "devDependencies": {
    "@eslint/js": "^10.0.1",
    "@types/node": "^24.0.0",
    "eslint": "^10.15.0",
    "typescript": "^5.9.0",
    "typescript-eslint": "^8.73.0"
  }
}
```

**`tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2024",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2024", "DOM"],
    "types": ["node"],
    "strict": true,
    "noEmit": true,
    "allowImportingTsExtensions": true,
    "erasableSyntaxOnly": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

**`tsconfig.build.json`**

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": false,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "rewriteRelativeImportExtensions": true
  },
  "exclude": ["src/**/*.test.ts", "src/testing/**"]
}
```

**`tsconfig.lib.json`**

Verifica a biblioteca sem os tipos do Node, para que `process`, `Buffer` e imports `node:` sejam rejeitados. `console` continua passando, porque a lib DOM também o declara.

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "types": []
  },
  "exclude": ["src/cli.ts", "src/adapters/**", "src/**/*.test.ts", "src/testing/**"]
}
```

**`eslint.config.js`**

Aplica as regras recomendadas com checagem de tipos e cobre o que o `tsconfig.lib.json` não pega: `console` fora do `src/cli.ts` e imports estáticos de adaptadores.

```javascript
import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig(
  { ignores: ["dist/"] },

  js.configs.recommended,

  // Claude Code hook scripts run directly in Node.
  {
    files: [".claude/hooks/**/*.mjs"],
    languageOptions: {
      globals: { process: "readonly" },
    },
  },

  {
    files: ["src/**/*.ts"],
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: { projectService: true },
    },
  },

  // node:test functions return promises that the runner already tracks.
  {
    files: ["src/**/*.test.ts"],
    rules: {
      "@typescript-eslint/no-floating-promises": [
        "error",
        {
          allowForKnownSafeCalls: [
            {
              from: "package",
              package: "node:test",
              name: ["test", "it", "describe", "suite"],
            },
          ],
        },
      ],
    },
  },

  // Printing lives only in the CLI. tsconfig.lib.json can't catch console,
  // because the DOM lib declares it.
  {
    files: ["src/**/*.ts"],
    ignores: ["src/cli.ts"],
    rules: { "no-console": "error" },
  },

  // Adapters are Node-only or provider-specific, so they are loaded with a
  // dynamic import() and never imported statically.
  {
    files: ["src/**/*.ts"],
    ignores: ["src/adapters/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/adapters/**"],
              message:
                "Load adapters with a dynamic import() from the CLI, never statically.",
            },
          ],
        },
      ],
    },
  },
);
```

**`.env.example`**

```text
# Copy this file to .env and fill in the values. Never commit .env.
# Used only by the CLI and the eval runner. The library and the adapters receive
# values as arguments.

# Anthropic API key, created in the Claude Console.
ANTHROPIC_API_KEY=
```

**`.claude/settings.json`**

Bloqueia a leitura do `.env` e define dois hooks. O `PostToolUse` chama o script `.claude/hooks/lint-edited-file.mjs`, que roda o ESLint só no arquivo que o Claude acabou de editar, para avisar do erro na hora. O `Stop` roda o `npm run -s check` (typecheck, lint e testes) no projeto inteiro quando o Claude termina um turno e, se falhar, faz o Claude continuar até corrigir. Essas garantias valem só para o Claude Code.

```json
{
  "permissions": {
    "deny": ["Read(./.env)"]
  },
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/lint-edited-file.mjs\"",
            "statusMessage": "Linting edited file"
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "cd \"$CLAUDE_PROJECT_DIR\" && npm run -s check 1>&2 || exit 2",
            "statusMessage": "Running checks (typecheck, lint, test)"
          }
        ]
      }
    ]
  }
}
```

**`.claude/hooks/lint-edited-file.mjs`**

Roda o ESLint pela API do Node no arquivo editado e mostra só os erros, com no máximo 20 linhas. Usar Node em vez de comandos de shell faz o hook funcionar igual em macOS, Linux e Windows.

```javascript
// PostToolUse hook: lints the file Claude just edited or created.
//
// Exit codes, as Claude Code reads them:
//   0 -> nothing to report; nothing is added to Claude's context.
//   2 -> stderr is sent back to Claude so it can fix the errors.
//
// It uses ESLint's Node API instead of a shell command, so it behaves the
// same on macOS, Linux and Windows.

import { ESLint } from "eslint";

const LINTED_EXTENSIONS = /\.(ts|js|mjs)$/;
const MAX_OUTPUT_LINES = 20; // keeps a bad edit from flooding Claude's context

async function readStdin() {
  let data = "";
  for await (const chunk of process.stdin) data += chunk;
  return data;
}

const input = JSON.parse(await readStdin());
const file = input.tool_input?.file_path ?? "";

if (!LINTED_EXTENSIONS.test(file)) process.exit(0);

const eslint = new ESLint({ cwd: process.env.CLAUDE_PROJECT_DIR ?? process.cwd() });
const results = await eslint.lintFiles([file]);
const errors = ESLint.getErrorResults(results); // errors only, like --quiet

if (errors.length === 0) process.exit(0);

const formatter = await eslint.loadFormatter("stylish");
const report = await formatter.format(errors);
const lines = report.trim().split("\n").slice(0, MAX_OUTPUT_LINES);

process.stderr.write(lines.join("\n") + "\n");
process.exit(2);
```

**`.githooks/pre-commit`**

Roda o `npm run check` antes de cada commit e cancela o commit se algo falhar. Vale para qualquer pessoa ou ferramenta, não só para o Claude Code. O script `prepare` do `package.json` o ativa no `npm install`. Depois de criar o arquivo, torne-o executável com `chmod +x .githooks/pre-commit`.

```sh
#!/bin/sh
# Runs every project check (typecheck, lint, test) before each commit.
# A non-zero exit cancels the commit.
# Activated by `npm install`, through the "prepare" script in package.json.

npm run -s check
```

**`.github/workflows/ci.yml`**

Roda `npm ci`, `npm run check` e `npm run build` numa máquina limpa do GitHub a cada push na `main` e em todo Pull Request. É a única verificação que não pode ser pulada. Não usa segredos: os testes usam um LLM falso, e os evals com a API real não rodam no CI.

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

# Least privilege: the workflow can only read the repository.
permissions:
  contents: read

# A newer push to the same branch cancels the run still in progress.
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  check:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version-file: .nvmrc
          cache: npm
      - run: npm ci
      - run: npm run check
      - run: npm run build
```

**`AGENTS.md`**

```markdown
# AGENTS.md

## Project
`receipt-reader` reads receipt images, checks that the image is a receipt, extracts basic
data with an LLM and returns the result as JSON. It does not verify authenticity; it
transcribes what the image shows. The code is generic; support grows by market: Brazil
first, then the US (see the plan).

**It is a library first, CLI second.** It stores nothing: no database and no image files.
Callers decide whether and where to save the result.

## Structure
- `src/index.ts`: public API: `readReceipt` and the contract types. No Node-only APIs.
- `src/types.ts`: the public contract (options, LLM client, result). A change here changes
  the JSON that callers receive.
- `src/model-output.ts`: zod schema of the model output, its single source. Its type, the
  JSON Schema sent to the LLM and the validation all come from it; never write them by hand.
- `src/prompt.ts`: prompt and output schema sent to the LLM. Bump `PROMPT_VERSION` on
  every change, so eval reports can tell versions apart.
- Other `src/*.ts` (except `src/cli.ts`): library steps. Same rule as `src/index.ts`.
- `src/cli.ts`: CLI entry point. Handles arguments, input files, printing and exit codes.
- `src/**/*.test.ts`: tests, next to the module they cover. They never call a real API;
  when they need a client, they use the fake LLM.
- `src/testing/`: test-only helpers (fake LLM client, output builders). Not published.
  Don't rename it to `test/`: `node --test` runs every file inside a `test/` folder.
- `src/adapters/` (created in Phase 4): Node-only or provider-specific code, imported
  dynamically by the CLI. The Claude adapter will also be exported as `receipt-reader/claude`.
- `specs/RECEIPT_READER_PLAN.md`: scope, decisions and phases. Read it before starting a phase.

## Setup
- Copy `.env.example` to `.env` to run the CLI or the eval runner. Only they read these
  variables; the library and the adapters receive values as arguments.
- `npm install` activates the git pre-commit hook in `.githooks/`, which runs `npm run check`.
  Never bypass it with `git commit --no-verify`.
- CI (`.github/workflows/ci.yml`) runs `npm run check` and `npm run build` on every push
  to `main` and on every pull request.

## Commands
- Run CLI: `npm start -- --file <image-path>`
- Type check: `npm run typecheck`
- Lint: `npm run lint`
- Test: `npm test`
- Build: `npm run build`
- All checks (typecheck, lint, test): `npm run check`. Run it before finishing any change.

## Conventions
- TypeScript, ESM, Node >= 24. Node runs `.ts` directly in development, so only use
  erasable syntax: no `enum`, `namespace` or constructor parameter properties.
- Published packages run from `dist/`, because Node does not strip types in `node_modules`.
- Library code must be environment-agnostic: no `fs`, `process`, `console` or other
  Node-only APIs. Inputs come in as arguments (e.g. image bytes, not a file path).
  `npm run typecheck` rejects Node-only APIs there, and `npm run lint` rejects `console`
  outside `src/cli.ts`.
- Argument parsing, reading files, printing and exit codes live only in `src/cli.ts`.
- Load adapters with a dynamic `import()`; `npm run lint` rejects static imports of them.
- The CLI writes results to stdout as JSON, errors to stderr, and exits non-zero on failure.
- Keep the LLM behind a small interface supplied by the caller.
- Never extract the consumer's CPF or other personal document numbers, such as RG or CNH
  (LGPD). The model must ignore them.
- Never hardcode API keys or connection strings.
- Receipt images, labels and per-receipt eval details stay in `data/` (gitignored); this repo
  is public. Only aggregated eval metrics go in `evals/results/`.
- Handle transient LLM failures inside the library (retries, refusal fallback). Throw only
  when the receipt can't be read; there is no `failed` status in the result.

## Dependencies
- Don't add dependencies without asking.
- Already approved in the plan:
  - `@anthropic-ai/sdk`
  - `zod` (validation and JSON Schema of the model output)
  - `eslint`, `@eslint/js` and `typescript-eslint` (dev)
```

**`src/index.ts`**

```typescript
export interface ReadReceiptOptions {
  /** Original bytes of the receipt image. */
  image: Uint8Array;
  /** Original file name. */
  fileName: string;
}

export interface ReadReceiptResult {
  status: "success" | "not_a_receipt";
}

/**
 * Library entry point. Must stay environment-agnostic (no fs, process or
 * console) so it can be used from Node, the CLI or a web project.
 */
export function readReceipt(
  options: ReadReceiptOptions,
): Promise<ReadReceiptResult> {
  // TODO: hash -> extract -> normalize -> warnings -> return JSON.
  void options;
  return Promise.reject(new Error("Not implemented"));
}
```

**`src/cli.ts`**

```typescript
#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { parseArgs } from "node:util";

import { readReceipt } from "./index.ts";

const { values } = parseArgs({
  options: { file: { type: "string" } },
});

if (!values.file) {
  console.error("Usage: receipt-reader --file <image-path>");
  process.exit(1);
}

try {
  const image = await readFile(values.file);
  const result = await readReceipt({
    image,
    fileName: basename(values.file),
  });
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
```

### 3. Instalar e validar

```bash
npm install
npm run check              # typecheck, lint e testes
npm run build
npm start                  # deve mostrar o uso e sair com código 1
npm pack --dry-run         # deve listar o conteúdo de dist/
```

**Pronto quando:** esses comandos se comportarem como indicado e um projeto de teste conseguir instalar o pacote e importar `readReceipt`.

## Arquitetura

```text
CLI (src/cli.ts) ou aplicação Node
        ↓
readReceipt(imagem, llm)   ← sem APIs do Node
   └─ ReceiptLlmClient   → adaptador Claude
        ↓
JSON com o resultado (nada é salvo)
```

### Configuração da CLI e do runner de evals

| Variável | Uso |
|---|---|
| `ANTHROPIC_API_KEY` | Chave da API |

Esse valor fica em um `.env` fora do Git, criado a partir do `.env.example`. Só a CLI e o runner de evals leem a variável, porque são os programas iniciados no terminal. Eles a passam ao adaptador, que cria o client entregue à biblioteca. Nem a biblioteca nem o adaptador leem a variável.

- **CLI:** sai com erro se a variável não estiver definida, antes de processar qualquer arquivo.
- **Runner de evals:** com o adaptador Claude (Fase 4 em diante), também sai com erro antes de processar qualquer recibo. Com o LLM falso (Fase 3), não precisa da variável.

### O que a CLI faz

A CLI é a ponte entre o terminal e a biblioteca: prepara as entradas, chama `readReceipt` e imprime o resultado.

1. Lê o argumento `--file`. Se faltar, mostra o uso e sai com código 1.
2. Confere a `ANTHROPIC_API_KEY`. Se faltar, sai com código 1 antes de ler qualquer arquivo.
3. Lê o arquivo e obtém os bytes da imagem.
4. Carrega o adaptador Claude com `import()` dinâmico.
5. Cria o client com a chave e o passa como `llm`.
6. Chama `readReceipt({ image, fileName, llm })`.
7. Imprime o JSON no stdout. Em caso de erro, imprime o motivo no stderr e sai com código 1.

**Até a Fase 4**, o adaptador não existe. A CLI faz as etapas 1, 3, 6 e 7 de verdade e usa no lugar do `llm` um client provisório, que sempre falha com "Claude adapter not available yet (Phase 4)". Assim a leitura do arquivo, a checagem do formato e a saída de erros já funcionam, e a Fase 4 só troca o client provisório pelas etapas 2, 4 e 5.

### Fluxo de uma imagem

Cada etapa e o tipo que ela produz. Os tipos estão em `src/types.ts` e detalhados na Fase 1.

```text
 CLI / aplicação
   │  ReadReceiptOptions { image, fileName, llm }
   ▼
 1. Detectar o formato pelos bytes ──► ImageMediaType         (vazio ou não suportado → lança, sem chamar o LLM)
 2. Calcular o SHA-256 (Web Crypto) ─► string (file_hash)
 3. Chamar o LLM uma vez ────────────► ReceiptLlmResponse { output: unknown, model }
      ReceiptLlmRequest { image, mediaType,   (retries e fallback dentro do client, veja a Fase 4;
        instructions, outputSchema }            se ele desistir → lança)
 4. Validar a saída do LLM ──────────► ReceiptModelOutput     (forma errada → lança)
      │
      ├─ is_receipt = false ─────────► ReadReceiptResult { status: "not_a_receipt", receipt: null, warnings: [] }
      ▼
 5. Normalizar valores e datas ──────► Receipt + ReceiptWarning[]   (invalid_date, invalid_amount)
 6. Conferir campos e soma ──────────► ReceiptWarning[]             (missing_field, illegible_field, sum_mismatch)
 7. Montar o resultado ──────────────► ReadReceiptResult { status: "success", ... }   (nada é gravado)
```

### Status

| Status | Significado |
|---|---|
| `success` | A imagem é um recibo e a extração rodou, mesmo que falte algum campo |
| `not_a_receipt` | A imagem não é um recibo |

Erro técnico não vira status. A biblioteca lança um erro com o motivo quando a imagem não é suportada, quando a saída do LLM vem malformada ou quando o client desiste depois de esgotar as tentativas. A CLI mostra o motivo no stderr e sai com código 1.

## Fase 1: contrato

Os tipos ficam em `src/types.ts`, que é a referência. Esta seção registra as decisões por trás deles.

A forma da saída do modelo é definida uma única vez, com zod, em `src/model-output.ts`. Dela saem o tipo TypeScript, o JSON Schema enviado ao LLM e a validação da resposta, então os três não podem divergir. Um teste trava o JSON Schema gerado, para que uma mudança no schema ou no zod não altere sem aviso o que a API recebe.

### Interface com o LLM

```ts
interface ReceiptLlmClient {
  extract(request: ReceiptLlmRequest): Promise<ReceiptLlmResponse>;
}
interface ReceiptLlmRequest {
  image: Uint8Array;
  mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
  instructions: string;                  // prompt da biblioteca
  outputSchema: Record<string, unknown>; // JSON Schema da saída do modelo
}
interface ReceiptLlmResponse {
  output: unknown; // JSON já parseado pelo client
  model: string;   // modelo que respondeu de fato
}
```

- **Prompt e schema pertencem à biblioteca** (`src/prompt.ts`). Por isso o `prompt_version` é uma constante dela, e trocar de provedor não muda o prompt. O client só transporta imagem, instruções e schema. As `instructions` vão como system prompt, e a mensagem do usuário leva só a imagem: separar as instruções confiáveis do conteúdo não confiável ajuda contra injeção de prompt.
- **`extract` só resolve com a resposta final.** Retries e fallbacks ficam dentro do client. Se ele desistir, rejeita, e a biblioteca repassa o erro.
- **`output` é `unknown`** porque a biblioteca não confia na resposta do LLM e valida a forma antes de usá-la. Se o texto devolvido não for JSON, quem lança o erro é o client.
- **`model` é o modelo que respondeu de fato.** Depois de um fallback, ele pode ser diferente do pedido. Vai direto para `result.model`.
- **O `fileName` nunca é enviado ao LLM.** Ele só volta em `file_name`, para evitar injeção ou vazamento pelo nome do arquivo.
- **O formato da imagem é detectado pelos bytes**, nunca pela extensão. Imagem vazia ou formato não suportado lança erro antes de chamar o LLM.

### Saída do modelo (`raw_output`)

`is_receipt` e seis campos (`merchant`, `receipt_date`, `subtotal`, `tax`, `tip`, `total`), cada um com `value` e `state`. O `value` é o texto como impresso (`"1.234,56"`, `"19/11/26"`), sem conversão pelo modelo.

| `state` | Significado | `value` | Em `receipt` |
|---|---|---|---|
| `present` | Impresso e legível | Texto não vazio | Normalizado |
| `present` | — | `null` ou vazio | Saída inválida: lança erro |
| `absent` | Não impresso no documento | `null` | `null` |
| `illegible` | Impresso, mas ilegível | `null` | `null` |
| `absent` ou `illegible` | — | Com texto | `null` (o texto fica só em `raw_output`) |

- **Sem campo de CPF**, e chaves extras são rejeitadas (`additionalProperties: false` no schema e na validação). O CPF não tem onde aparecer.
- **O prompt manda ignorar o CPF e qualquer outro número de documento pessoal**, como RG e CNH. A restrição é mais ampla que o CPF de propósito, pela LGPD. O CNPJ do estabelecimento não é documento pessoal.
- **Com `is_receipt: false`**, os seis campos continuam obrigatórios (o prompt pede `absent`). A biblioteca valida a forma, mas não os lê.

### Resultado

`status`, `file_name`, `file_hash` (SHA-256 em hex minúsculo), `receipt` (`null` quando não é recibo), `raw_output`, `warnings`, `model` e `prompt_version`.

- **Campos de `receipt`:** `merchant`, `receipt_date`, `subtotal`, `tax`, `tip`, `total` e `currency` (`BRL` por enquanto).
- **Valores** viram **string decimal** com duas casas: `"1.234,56"` → `"1234.56"`. String, e não número, para evitar erros de ponto flutuante em quem consome o JSON. Aceita `1.234,56`, `1234,56` e `R$ 12,50`; qualquer outro formato fica `null`.
- **Datas** em `DD/MM/AAAA` ou `DD/MM/AA` (AA vira 20AA, comum em maquininhas) viram ISO (`AAAA-MM-DD`). Datas que não existem, como `31/02`, ficam `null`.
- **`not_a_receipt`:** `receipt` é `null`, `warnings` é vazio e o `raw_output` é mantido.

### `warnings`

Cada aviso tem `code`, `message` e, quando se refere a um campo, `field`.

| `code` | Quando |
|---|---|
| `missing_field` | Comerciante, data ou total com estado `absent` |
| `illegible_field` | Comerciante, data ou total com estado `illegible` |
| `invalid_date` | Data impressa num formato que não dá para ler, ou que não existe (como `31/02`) |
| `invalid_amount` | Valor impresso num formato que não dá para ler |
| `sum_mismatch` | `subtotal + gorjeta ≠ total`, quando os três existem. Conferido em centavos; o imposto não entra |

Um campo inválido gera só `invalid_date` ou `invalid_amount`, sem `missing_field` repetido.

**Pronto quando:** os testes com `node:test` passarem usando um LLM falso, sem custo, e o `npm run typecheck` estiver limpo.

## Fase 2: dataset de referência

- **Volume:** 50 a 100 recibos brasileiros reais, divididos entre cupons não fiscais e comprovantes de maquininha, e cerca de 15 a 20% de imagens que não são recibos.
- **Variedade:** vários tipos de comércio e de maquininha, foto ruim, papel térmico desbotado, taxa de serviço e 5 a 10 imagens com texto de injeção. Incluir algumas NFC-e para verificar que são aceitas como recibo.
- **Casos difíceis de classificação:** orçamento, pedido, boleto e extrato bancário.
- **Rótulos:** preenchidos sem ver a saída do modelo, em JSONL. Recibos com CPF são rotulados sem ele.
- **Divisão:** `dev` para ajustar o prompt e `test` só para a medição final.
- **Privacidade:** as imagens e os rótulos ficam em `data/`, fora do Git, só no laptop e em um backup privado. O repositório é público.

**Pronto quando:** o dataset estiver rotulado e dividido, cobrindo os tipos acima.

## Fase 3: runner de evals

A correção é determinística, sem LLM como juiz, e cada relatório registra as versões do modelo e do prompt.

| Métrica | O que responde |
|---|---|
| Precisão e recall do `is_receipt` | O gate funciona? |
| Acurácia por campo | Qual campo falha mais? |
| Documento 100% correto | Quantos recibos não precisarão de correção? |
| Alucinação | O modelo inventa campos ausentes? |
| Acurácia por tipo de imagem | Onde a qualidade cai? |
| Resistência à injeção | Texto na imagem altera a saída? |
| Custo e latência por documento | O resultado compensa? |

Cada execução gera duas saídas separadas:

| Saída | Conteúdo | Onde fica |
|---|---|---|
| **Resumo** | Só métricas agregadas, versões do modelo e do prompt, custo e latência | `evals/results/`, commitado, para ter o histórico da qualidade |
| **Detalhe** | Resultado por recibo: valores esperados e lidos, erros | `data/reports/`, fora do Git, porque contém dados reais dos recibos |

**Pronto quando:** o runner gerar o relatório completo usando o LLM falso. Isso permite validá-lo antes de gastar com a API.

## Fase 4: adaptador Claude e baseline

- **Dependência:** `@anthropic-ai/sdk`, em `dependencies`, porque a CLI publicada precisa dele.
- **Formato:** `src/adapters/claude.ts` exporta uma função que cria o client. O adaptador é o código; o client é o objeto que ele devolve e que vai em `llm`.

  ```ts
  export function createClaudeClient(options: { apiKey: string }): ReceiptLlmClient
  ```

- **Chave:** o adaptador recebe a chave por argumento e nunca lê `process.env`. Quem chama decide de onde ela vem: a CLI e o runner de evals leem a `ANTHROPIC_API_KEY`; outra aplicação usa a fonte que tiver.
- **Exportação:** o adaptador é público, na entrada `receipt-reader/claude` do `exports` no `package.json`. Assim uma aplicação reaproveita os retries e o fallback em vez de reimplementá-los. A entrada `"."` continua sem depender da Anthropic: quem não importa `receipt-reader/claude` nunca carrega o SDK. Como vira API pública, mudar a assinatura de `createClaudeClient` é uma mudança que quebra quem usa.
- **CLI:** trocar o client provisório pelas etapas 2, 4 e 5 de "O que a CLI faz".
- **README:** criar, para quem for usar a lib. Deve mostrar como instalar, um exemplo com `createClaudeClient` e `readReceipt`, um exemplo de resultado e como implementar um `ReceiptLlmClient` próprio.
- **Chamada:** SDK oficial com visão e `output_config.format`, sem ferramentas. `request.instructions` vai no parâmetro `system`, e a mensagem do usuário contém só a imagem, sem texto. Assim um texto na imagem que tente dar ordens fica num nível abaixo das nossas instruções.
- **Modelo inicial:** `claude-opus-5-5`, com `effort` explícito, porque o thinking não pode ser desligado nesse modelo.
- **Fallback de recusa:** ativado por padrão (`fallbacks: "default"`), devolvendo o `response.model` em `model`. Pode ser desligado.
- **Falhas:** tratadas dentro do adaptador, em camadas:
  1. O SDK repete sozinho os erros temporários: 408, 409, 429, 5xx e falhas de conexão, com 2 tentativas extras por padrão (`maxRetries`).
  2. Recusas passam pelo fallback de modelo.
  3. Uma resposta cortada por `max_tokens` é repetida uma vez com um limite maior.
  4. Se nada disso resolver, o adaptador rejeita com o motivo, e a biblioteca repassa o erro.
- **Segurança:** o conteúdo da imagem é tratado como dado, e o extrator não tem ferramentas nem permissões.

**Pronto quando:** houver um baseline zero-shot medido no `dev`. As metas de acurácia só serão definidas depois disso.

## Fase 5: experimentos de estudo

Cada experimento muda uma variável, medida no `dev`:
1. **Zero-shot vs. few-shot:** quanto os exemplos melhoram cada campo?
2. **Opus 5.5 vs. Sonnet 5.5 vs. Haiku 5.5:** qual tem o menor custo por documento correto?
3. **Valores de `effort`:** a partir de qual nível a qualidade para de melhorar?
4. **Resolução e pré-processamento:** reduzir, girar ou recortar a imagem ajuda ou prejudica?
5. **Sinal de injeção:** com um campo `contains_instructions` no schema, o modelo marca as imagens com texto de injeção do dataset? Medir a precisão e o recall. Só se o resultado for bom, o campo entra no contrato, com um warning próprio (como `suspicious_content`) para quem usa a lib mandar esses recibos para revisão.

Preços de tabela por milhão de tokens de entrada e saída, conforme a referência de 06/10/2026 (confirme antes de usar):

| Modelo | ID | Entrada | Saída |
|---|---|---|---|
| Opus 5.5 | `claude-opus-5-5` | $4,00 | $20,00 |
| Sonnet 5.5 | `claude-sonnet-5-5` | $2,00 | $10,00 |
| Haiku 5.5 | `claude-haiku-5-5` | $0,10 | $0,50 |

A melhor configuração é medida uma vez no `test`, com a Batch API, que custa 50% menos.

**Pronto quando:** houver uma configuração escolhida e justificada com os números do `test`.

## Fase 6: fine-tuning (opcional)

Só vale a pena se sobrar um problema de custo ou acurácia. Os modelos Claude atuais não oferecem fine-tuning pela API, então a comparação seria um modelo ajustado no Vertex AI, ou um modelo aberto, contra o melhor resultado da Fase 5.

- **Pergunta:** um modelo barato ajustado alcança o melhor resultado com few-shot, com custo total menor?
- **Dados:** `raw_output` mais correções humanas, se o sistema que consome o resultado guardar os dois.
- **Cuidado:** revisores tendem a aceitar o valor já preenchido, então as correções podem ter viés. O resultado continua sendo medido no dataset de referência.
- **Antes de começar:** confirmar a disponibilidade atual na documentação oficial do provedor.

"Não vale a pena" também é um resultado válido de estudo.

## Fase 7: operação contínua

- **Regressão:** rodar os evals a cada mudança de prompt ou modelo.
- **Produção:** se o sistema que consome o resultado guardar o `raw_output` e as correções, acompanhar a taxa de correção por campo.
- **Dataset:** transformar erros reais em novos casos de teste, depois de rotulá-los sem ver a saída do modelo.

## Roadmap: mercado americano

Entra depois que o Brasil estiver medido no `test`. O formato do JSON não muda.

- **Documentos:** *receipts* de loja e restaurante.
- **Regras:** valores como `1,234.56` em `USD`, datas `MM/DD/YY`, e a soma passa a ser `subtotal + imposto + gorjeta = total`, porque o *sales tax* é somado no fim.
- **Gorjeta:** muitas vezes escrita à mão.
- **Dataset e evals próprios:** 50 a 100 *receipts* americanos rotulados, com o mesmo processo da Fase 2.

**Pronto quando:** os evals americanos tiverem um baseline medido, sem piorar os resultados brasileiros.

## Riscos

- **Injeção de prompt:** um texto na imagem pode tentar alterar a saída. O extrator fica sem ferramentas, e a resistência é medida nos evals.
- **Limitação do hash:** ele só identifica o mesmo arquivo. Quem usar o hash para deduplicar deve saber que duas fotos do mesmo recibo, ou uma imagem recomprimida, geram hashes diferentes.
- **Privacidade (LGPD):** recibos podem ter CPF, nomes e dígitos finais de cartão. A biblioteca não extrai o CPF nem outros números de documento pessoal. A biblioteca não guarda nada, mas o dataset e os sistemas que consomem o resultado guardam. Defina quem acessa esses dados e por quanto tempo eles ficam guardados, e consulte o jurídico antes de usar dados reais.
- **Benchmarks públicos:** não verificamos um dataset público de cupons brasileiros com rótulos. Os datasets conhecidos (como SROIE e CORD) são de outros países, então os resultados de outros estudos servem só como hipótese.

## Referências

- [Vision vs. text parsing em invoices (arXiv 2509.04469)](https://arxiv.org/abs/2509.04469)
- [Prompt design em faturas de energia (arXiv 2604.25927)](https://arxiv.org/html/2604.25927)
- [Confiança em extração de campos (arXiv 2606.24420)](https://arxiv.org/abs/2606.24420)
- [Avaliação de extração em produção (Hyperscience)](https://www.hyperscience.ai/?p=14167)
- [Red team de injeção em document AI](https://prasannakumar018.github.io/Red-teaming/writeups/02_direct_prompt_injection)
- [Ajuste supervisionado do Gemini (Vertex AI)](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/gemini-supervised-tuning)
- [Descontinuações da OpenAI, incluindo fine-tuning](https://developers.openai.com/api/docs/deprecations)
