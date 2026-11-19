# Plano: leitura de recibos brasileiros com LLM

Projeto de estudo e implementação para ler imagens de recibos brasileiros, extrair dados básicos com um LLM e devolver o resultado em JSON.

**Status:** Fase 0 concluída. A Fase 1 ainda não foi iniciada. Em 19/11/2026, o escopo mudou: a biblioteca não salva mais nada (nem banco, nem imagens) e só devolve o resultado. Também mudou o foco: o mercado brasileiro vem primeiro, e o americano fica no roadmap.

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
- Extrair o CPF do consumidor. O modelo deve ignorá-lo (LGPD).

## Decisões

| Tema | Decisão |
|---|---|
| Projeto | Novo repositório `receipt-reader`, separado deste |
| Formato | Biblioteca que devolve JSON, com uma CLI que imprime esse JSON |
| Persistência | Nenhuma. A biblioteca não grava em banco nem salva imagens |
| Stack | Node.js 24, TypeScript e ESM |
| LLM | API da Anthropic, atrás de uma interface |
| Dependências aprovadas | `@anthropic-ai/sdk`; `eslint`, `@eslint/js` e `typescript-eslint` (dev) |
| Mercado | Brasil primeiro. O contrato já é genérico (`currency`, data em ISO) para receber os EUA depois sem mudar o JSON |
| Documentos | Validados: cupom não fiscal e comprovante de maquininha. NFC-e e CF-e SAT também são tratados como recibo, mas sem qualidade medida |
| Campos | Todos os campos do recibo são anuláveis. Um comprovante de maquininha, por exemplo, só costuma ter o total |
| Imposto | Lido só quando aparece, como o "Valor aproximado dos tributos" (Lei 12.741). É informativo: no Brasil ele já está embutido no total |
| Gorjeta | No Brasil, é a taxa de serviço (em geral 10%, opcional) |
| CPF do consumidor | Nunca extraído |
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
  "exclude": ["src/**/*.test.ts"]
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
  "exclude": ["src/cli.ts", "src/adapters/**", "src/**/*.test.ts"]
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
# Used only by the CLI. The library receives ready-made clients as arguments.

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
- `src/index.ts`: public API. No Node-only APIs.
- `src/cli.ts`: CLI entry point. Handles arguments, input files, printing and exit codes.
- `src/adapters/` (created with the first adapter): Node-only or provider-specific code,
  imported dynamically by the CLI.
- `specs/RECEIPT_READER_PLAN.md`: scope, decisions and phases. Read it before starting a phase.

## Setup
- Copy `.env.example` to `.env` to run the CLI. Only the CLI reads these variables.
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
- Never extract the consumer's CPF (LGPD). The model must ignore it.
- Never hardcode API keys or connection strings.
- Receipt images, labels and per-receipt eval details stay in `data/` (gitignored); this repo
  is public. Only aggregated eval metrics go in `evals/results/`.
- Handle transient LLM failures inside the library (retries, refusal fallback). Throw only
  when the receipt can't be read; there is no `failed` status in the result.

## Dependencies
- Don't add dependencies without asking.
- Already approved in the plan:
  - `@anthropic-ai/sdk`
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

### Configuração da CLI

| Variável | Uso |
|---|---|
| `ANTHROPIC_API_KEY` | Chave da API |

Esse valor fica em um `.env` fora do Git, criado a partir do `.env.example`. A CLI sai com erro se a variável não estiver definida, antes de processar qualquer arquivo. A biblioteca recebe o cliente pronto e nunca lê essa variável.

### Fluxo de uma imagem

1. Calcular o SHA-256 do arquivo original com Web Crypto.
2. Chamar o LLM uma vez para classificar e extrair. As falhas temporárias são tratadas aqui (veja a Fase 4).
3. Normalizar valores e datas no código e calcular os `warnings`.
4. Devolver o JSON. Nada é gravado.

### Status

| Status | Significado |
|---|---|
| `success` | A imagem é um recibo e a extração rodou, mesmo que falte algum campo |
| `not_a_receipt` | A imagem não é um recibo |

Erro técnico não vira status. Depois de esgotar as tentativas, a biblioteca lança um erro com o motivo, e a CLI o mostra no stderr e sai com código 1.

## Fase 1: contrato

- **Interface:** `ReceiptLlmClient`.
- **Resultado:** `status`, `file_name`, `file_hash`, `receipt` (campos normalizados, ou `null` quando não é recibo), `raw_output`, `warnings`, `model` e `prompt_version`.
- **Saída do modelo:** `is_receipt` e, para cada campo, o valor bruto e o estado `present`, `absent` ou `illegible`.
- **Campos de `receipt`:** `merchant`, `receipt_date`, `subtotal`, `tax`, `tip`, `total` e `currency` (`BRL` por enquanto).
- **Normalização:** valores impressos como `1.234,56` viram decimal, e datas impressas como `DD/MM/AAAA` viram ISO (`AAAA-MM-DD`). Uma data inválida fica nula e gera um aviso.
- **`warnings`:** soma que não fecha (`subtotal + gorjeta ≠ total`, quando os três existem) e comerciante, data ou total ausente.

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

- **Dependência:** `@anthropic-ai/sdk`.
- **Chamada:** SDK oficial com visão e `output_config.format`, sem ferramentas.
- **Modelo inicial:** `claude-opus-5-5`, com `effort` explícito, porque o thinking não pode ser desligado nesse modelo.
- **Fallback de recusa:** ativado por padrão (`fallbacks: "default"`), gravando o `response.model`. Pode ser desligado.
- **Falhas:** tratadas no harness, em camadas:
  1. O SDK repete sozinho os erros temporários: 408, 409, 429, 5xx e falhas de conexão, com 2 tentativas extras por padrão (`maxRetries`).
  2. Recusas passam pelo fallback de modelo.
  3. Uma resposta cortada por `max_tokens` é repetida uma vez com um limite maior.
  4. Se nada disso resolver, a biblioteca lança um erro com o motivo.
- **Segurança:** o conteúdo da imagem é tratado como dado, e o extrator não tem ferramentas nem permissões.

**Pronto quando:** houver um baseline zero-shot medido no `dev`. As metas de acurácia só serão definidas depois disso.

## Fase 5: experimentos de estudo

Cada experimento muda uma variável, medida no `dev`:
1. **Zero-shot vs. few-shot:** quanto os exemplos melhoram cada campo?
2. **Opus 5.5 vs. Sonnet 5.5 vs. Haiku 5.5:** qual tem o menor custo por documento correto?
3. **Valores de `effort`:** a partir de qual nível a qualidade para de melhorar?
4. **Resolução e pré-processamento:** reduzir, girar ou recortar a imagem ajuda ou prejudica?

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
- **Privacidade (LGPD):** recibos podem ter CPF, nomes e dígitos finais de cartão. A biblioteca não extrai o CPF. A biblioteca não guarda nada, mas o dataset e os sistemas que consomem o resultado guardam. Defina quem acessa esses dados e por quanto tempo eles ficam guardados, e consulte o jurídico antes de usar dados reais.
- **Benchmarks públicos:** não verificamos um dataset público de cupons brasileiros com rótulos. Os datasets conhecidos (como SROIE e CORD) são de outros países, então os resultados de outros estudos servem só como hipótese.

## Referências

- [Vision vs. text parsing em invoices (arXiv 2509.04469)](https://arxiv.org/abs/2509.04469)
- [Prompt design em faturas de energia (arXiv 2604.25927)](https://arxiv.org/html/2604.25927)
- [Confiança em extração de campos (arXiv 2606.24420)](https://arxiv.org/abs/2606.24420)
- [Avaliação de extração em produção (Hyperscience)](https://www.hyperscience.ai/?p=14167)
- [Red team de injeção em document AI](https://prasannakumar018.github.io/Red-teaming/writeups/02_direct_prompt_injection)
- [Ajuste supervisionado do Gemini (Vertex AI)](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/gemini-supervised-tuning)
- [Descontinuações da OpenAI, incluindo fine-tuning](https://developers.openai.com/api/docs/deprecations)
