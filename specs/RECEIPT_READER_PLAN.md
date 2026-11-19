# Plano: leitura de recibos americanos com LLM

Projeto de estudo e implementação para ler imagens de recibos americanos, extrair dados básicos com um LLM e salvar o resultado.

**Status:** Fase 0 concluída. A Fase 1 ainda não foi iniciada.

## Escopo

**Dentro do escopo:**
- Verificar se a imagem é um recibo.
- Extrair comerciante, data, subtotal, imposto, gorjeta e total.
- Salvar todas as tentativas de leitura e os recibos extraídos.
- Medir a qualidade com evals e estudar práticas de mercado.

**Fora do escopo:**
- Validar se o recibo é verdadeiro. O sistema transcreve o que a imagem mostra.
- Cruzar dados com transações, categorizar despesas ou verificar requisitos fiscais.
- Extrair os itens do recibo, por enquanto.
- Revisão humana. Tudo será revisado em outro sistema, que usa a mesma base de dados.
- Suporte a múltiplas empresas, por enquanto.

## Decisões

| Tema | Decisão |
|---|---|
| Projeto | Novo repositório `receipt-reader`, separado deste |
| Formato | Biblioteca primeiro, com CLI |
| Stack | Node.js 24, TypeScript e ESM |
| Banco | Postgres, compartilhado com o sistema de revisão |
| Imagens | Pasta local indicada pela variável `RECEIPTS_DIR` |
| LLM | API da Anthropic, atrás de uma interface |
| Dependências aprovadas | `@anthropic-ai/sdk`, `pg` e `@types/pg` (dev) |
| Campos | Todos os campos de `receipts` são anuláveis |
| `success` | A imagem é um recibo e a extração rodou, mesmo que falte algum campo |
| Campo importante ausente | Comerciante, data ou total ausente gera um aviso em `warnings` |
| Hash repetido | Qualquer tentativa sem `deleted_at` bloqueia o arquivo, seja qual for o status |
| Reenvio ignorado | Não cria linha e não chama o LLM |
| Reimportação | Preencher `deleted_at` libera o arquivo, e o próximo envio cria um novo registro |
| `raw_output` | Imutável depois de gravado |

### Princípios de leitura

- **Campo ausente:** vira `null`. O modelo não deve calcular nem inventar valores.
- **Campo ilegível:** também vira `null`, mas com um estado que o diferencia de um campo ausente.
- **Soma que não fecha:** salva o que está impresso e registra um aviso, sem corrigir. A divergência nem sempre é erro: um cupom de desconto também faz a soma não fechar.
- **Valor bruto e normalizado:** o bruto fica no `raw_output`, e o normalizado fica em `receipts`.

## Pré-requisitos

- **Chave da API:** criar no Claude Console, com créditos próprios. A assinatura do Claude Code não cobre o uso da API.
- **Limite de gastos:** definir no Console, porque os evals consomem créditos.
- **Postgres:** ter um banco acessível pela `DATABASE_URL`.

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
  "description": "Reads US receipt images, extracts basic data using an LLM and stores the result.",
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
  "files": ["dist"],
  "engines": {
    "node": ">=24"
  },
  "scripts": {
    "start": "node --env-file-if-exists=.env src/cli.ts",
    "build": "tsc -p tsconfig.build.json",
    "typecheck": "tsc && tsc -p tsconfig.lib.json",
    "test": "node --test"
  },
  "devDependencies": {
    "@types/node": "^24.0.0",
    "typescript": "^5.9.0"
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

**`.env.example`**

```text
# Copy this file to .env and fill in the values. Never commit .env.
# Used only by the CLI. The library receives ready-made clients as arguments.

# Anthropic API key, created in the Claude Console.
ANTHROPIC_API_KEY=

# Postgres connection string, e.g. postgres://user:password@localhost:5432/receipts
DATABASE_URL=

# Local folder where receipt images are stored.
RECEIPTS_DIR=
```

**`.claude/settings.json`**

Bloqueia a leitura do `.env` e roda o typecheck quando o Claude Code termina um turno. Essas garantias valem só para o Claude Code.

```json
{
  "permissions": {
    "deny": ["Read(./.env)"]
  },
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "cd \"$CLAUDE_PROJECT_DIR\" && npm run typecheck 1>&2 || exit 2",
            "statusMessage": "Running typecheck"
          }
        ]
      }
    ]
  }
}
```

**`AGENTS.md`**

```markdown
# AGENTS.md

## Project
`receipt-reader` reads images of US receipts, checks that the image is a receipt,
extracts basic data with an LLM and stores the result. It does not verify authenticity;
it transcribes what the image shows. Humans review results in a separate system.

**It is a library first, CLI second.**

## Structure
- `src/index.ts`: public API. No Node-only APIs.
- `src/cli.ts`: CLI entry point. Handles arguments, input files, printing and exit codes.
- `src/adapters/` (created with the first adapter): Node-only or provider-specific code,
  imported dynamically by the CLI.
- `specs/RECEIPT_READER_PLAN.md`: scope, decisions and phases. Read it before starting a phase.

## Setup
- Copy `.env.example` to `.env` to run the CLI. Only the CLI reads these variables.

## Commands
- Run CLI: `npm start -- --file <image-path>`
- Type check: `npm run typecheck`
- Test: `npm test`
- Build: `npm run build`

## Conventions
- TypeScript, ESM, Node >= 24. Node runs `.ts` directly in development, so only use
  erasable syntax: no `enum`, `namespace` or constructor parameter properties.
- Published packages run from `dist/`, because Node does not strip types in `node_modules`.
- Library code must be environment-agnostic: no `fs`, `process`, `console` or other
  Node-only APIs. Inputs come in as arguments (e.g. image bytes, not a file path).
  `npm run typecheck` rejects Node-only APIs there, but not `console`, which the DOM lib declares.
- Argument parsing, reading files, printing and exit codes live only in `src/cli.ts`.
- The CLI writes results to stdout as JSON, errors to stderr, and exits non-zero on failure.
- Keep the LLM, database and image storage behind small interfaces supplied by the caller.
- Never hardcode API keys or connection strings.
- `raw_output` is immutable after it is written.

## Dependencies
- Don't add dependencies without asking.
- Already approved in the plan:
  - `@anthropic-ai/sdk`
  - `pg`
  - `@types/pg` (dev)
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
  status: "success" | "not_a_receipt" | "failed" | "ignored";
}

/**
 * Library entry point. Must stay environment-agnostic (no fs, process or
 * console) so it can be used from Node, the CLI or a web project.
 */
export async function readReceipt(
  options: ReadReceiptOptions,
): Promise<ReadReceiptResult> {
  // TODO: hash -> reserve -> store image -> extract -> normalize -> save.
  void options;
  throw new Error("Not implemented");
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
npm run typecheck
npm run build
npm start                  # deve mostrar o uso e sair com código 1
npm pack --dry-run         # deve listar o conteúdo de dist/
```

**Pronto quando:** esses comandos se comportarem como indicado e um projeto de teste conseguir instalar o pacote e importar `readReceipt`.

## Arquitetura

```text
CLI (src/cli.ts) ou aplicação Node
        ↓
readReceipt(imagem, llm, repositório, imageStore)   ← sem APIs do Node
   ├─ ReceiptLlmClient   → adaptador Claude
   ├─ ReceiptRepository  → adaptador Postgres
   └─ ImageStore         → adaptador de disco local
```

### Configuração da CLI

| Variável | Uso |
|---|---|
| `ANTHROPIC_API_KEY` | Chave da API |
| `DATABASE_URL` | Conexão com o Postgres |
| `RECEIPTS_DIR` | Pasta local das imagens |

Esses valores ficam em um `.env` fora do Git, criado a partir do `.env.example`. A CLI sai com erro se alguma variável não estiver definida, antes de processar qualquer arquivo. A biblioteca recebe os clientes prontos e nunca lê essas variáveis.

### Fluxo de uma imagem

1. Calcular o SHA-256 do arquivo original com Web Crypto.
2. Criar a linha como `processing`, com `ON CONFLICT DO NOTHING`. Se já houver uma linha ativa, retornar `ignored` sem criar registro.
3. Salvar a imagem em `RECEIPTS_DIR/<hash>.<ext>` e guardar em `file_path` o caminho relativo a essa pasta.
4. Chamar o LLM uma vez, fora de transação, para classificar e extrair.
5. Salvar o `raw_output`.
6. Normalizar valores e datas no código e calcular os `warnings`.
7. Em uma transação, criar o registro em `receipts` e marcar `success`. Nos outros casos, marcar `not_a_receipt` ou `failed`.

### Status

| Status | Significado |
|---|---|
| `processing` | Extração em andamento |
| `success` | Recibo salvo, com `receipt_id` |
| `not_a_receipt` | A imagem não é um recibo |
| `failed` | Erro técnico |

`ignored` é só um resultado retornado pela biblioteca e pela CLI, e não é gravado no banco.

### Arquivos bloqueados

Por causa da regra do hash, o arquivo fica bloqueado até alguém preencher o `deleted_at` nestes casos:
- **Falha técnica:** um timeout momentâneo bloqueia o reenvio.
- **Classificação errada:** um recibo marcado como `not_a_receipt` fica bloqueado.
- **Queda durante a extração:** a linha pode ficar presa em `processing`.

## Fase 1: contrato

- **Interfaces:** `ReceiptLlmClient`, `ReceiptRepository` e `ImageStore`.
- **Saída do modelo:** `is_receipt` e, para cada campo, o valor bruto e o estado `present`, `absent` ou `illegible`.
- **Normalização:** valores como decimal e datas em `MM/DD/YY`. Uma data inválida fica nula e gera um aviso.
- **`warnings`:** soma que não fecha e comerciante, data ou total ausente.

**Pronto quando:** os testes com `node:test` passarem usando um LLM falso, sem custo, e o `npm run typecheck` estiver limpo.

## Fase 2: dataset de referência

- **Volume:** 50 a 100 recibos americanos reais e cerca de 15 a 20% de imagens que não são recibos.
- **Variedade:** vários estados, foto ruim, papel desbotado, gorjeta manuscrita e 5 a 10 imagens com texto de injeção.
- **Casos difíceis de classificação:** invoice não paga, orçamento, confirmação de pedido e extrato bancário.
- **Rótulos:** preenchidos sem ver a saída do modelo, em JSONL.
- **Divisão:** `dev` para ajustar o prompt e `test` só para a medição final.
- **Privacidade:** as imagens ficam em `data/`, fora do Git.

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

**Pronto quando:** o runner gerar o relatório completo usando o LLM falso. Isso permite validá-lo antes de gastar com a API.

## Fase 4: adaptador Claude e baseline

- **Dependência:** `@anthropic-ai/sdk`.
- **Chamada:** SDK oficial com visão e `output_config.format`, sem ferramentas.
- **Modelo inicial:** `claude-opus-5-5`, com `effort` explícito, porque o thinking não pode ser desligado nesse modelo.
- **Fallback de recusa:** ativado por padrão (`fallbacks: "default"`), gravando o `response.model`. Pode ser desligado.
- **Falhas:** erro da API, `refusal` ou `max_tokens` viram `failed`.
- **Segurança:** o conteúdo da imagem é tratado como dado, e o extrator não tem ferramentas nem permissões.

**Pronto quando:** houver um baseline zero-shot medido no `dev`. As metas de acurácia só serão definidas depois disso.

## Fase 5: persistência no Postgres

- **Dependências:** `pg` e `@types/pg` (dev).
- **Migrações:** arquivos SQL, sem ferramenta adicional.

```sql
CREATE TABLE receipts (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  merchant      text,
  receipt_date  date,
  subtotal      numeric(12,2),
  tax           numeric(12,2),
  tip           numeric(12,2),
  total         numeric(12,2),
  deleted_at    timestamptz
);

CREATE TABLE extraction_attempts (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  file_name      text NOT NULL,
  file_hash      text NOT NULL,
  file_path      text,
  extracted_at   timestamptz NOT NULL DEFAULT now(),
  status         text NOT NULL CHECK (status IN
                   ('processing', 'success', 'not_a_receipt', 'failed')),
  error_message  text,
  model          text,
  prompt_version text,
  raw_output     jsonb,
  warnings       jsonb NOT NULL DEFAULT '[]',
  receipt_id     bigint REFERENCES receipts (id),
  deleted_at     timestamptz
);

CREATE UNIQUE INDEX extraction_attempts_active_hash
  ON extraction_attempts (file_hash)
  WHERE deleted_at IS NULL;
```

- **`raw_output` imutável:** como outro sistema usa a mesma base, um trigger no Postgres permite gravar o campo uma única vez e bloqueia alterações depois disso.
- **Operação:** um comando para listar linhas presas em `processing` e `failed`, e outro para marcá-las como excluídas.

### Contrato com o sistema de revisão

- Corrige apenas `receipts`, nunca o `raw_output`.
- Ao excluir, preenche `deleted_at` nas duas tabelas, na mesma transação. Exclusões físicas ficam fora do contrato.
- Para abrir as imagens, acessa a mesma pasta e monta o caminho completo como `RECEIPTS_DIR` + `file_path`. Se rodar em outra máquina, as imagens não vão abrir até que essa pasta seja compartilhada com ela.

**Pronto quando:** houver testes para reenvio, envio simultâneo, reimportação após exclusão e tentativa de alterar o `raw_output`.

## Fase 6: experimentos de estudo

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

## Fase 7: fine-tuning (opcional)

Só vale a pena se sobrar um problema de custo ou acurácia. Os modelos Claude atuais não oferecem fine-tuning pela API, então a comparação seria um modelo ajustado no Vertex AI, ou um modelo aberto, contra o melhor resultado da Fase 6.

- **Pergunta:** um modelo barato ajustado alcança o melhor resultado com few-shot, com custo total menor?
- **Dados:** `raw_output` mais correções humanas.
- **Cuidado:** revisores tendem a aceitar o valor já preenchido, então as correções podem ter viés. O resultado continua sendo medido no dataset de referência.
- **Antes de começar:** confirmar a disponibilidade atual na documentação oficial do provedor.

"Não vale a pena" também é um resultado válido de estudo.

## Fase 8: operação contínua

- **Regressão:** rodar os evals a cada mudança de prompt ou modelo.
- **Produção:** acompanhar a taxa de correção por campo, comparando `raw_output` e `receipts`.
- **Dataset:** transformar erros reais em novos casos de teste, depois de rotulá-los sem ver a saída do modelo.

## Riscos

- **Injeção de prompt:** um texto na imagem pode tentar alterar a saída. O extrator fica sem ferramentas, e a resistência é medida nos evals.
- **Limitação do hash:** ele só detecta o mesmo arquivo. Duas fotos do mesmo recibo, ou uma imagem recomprimida, são lidas como arquivos diferentes.
- **Privacidade:** recibos podem ter nomes e dígitos finais de cartão. Defina quem acessa a pasta e o banco e por quanto tempo os dados ficam guardados, e consulte o jurídico antes de usar dados reais.
- **Armazenamento local:** a pasta precisa de backup próprio, porque o banco guarda só o caminho.
- **Benchmarks públicos:** não encontramos um dataset público de recibos de varejo americanos com rótulos, então os resultados de outros estudos servem só como hipótese.

## Referências

- [Vision vs. text parsing em invoices (arXiv 2509.04469)](https://arxiv.org/abs/2509.04469)
- [Prompt design em faturas de energia (arXiv 2604.25927)](https://arxiv.org/html/2604.25927)
- [Confiança em extração de campos (arXiv 2606.24420)](https://arxiv.org/abs/2606.24420)
- [Avaliação de extração em produção (Hyperscience)](https://www.hyperscience.ai/?p=14167)
- [Red team de injeção em document AI](https://prasannakumar018.github.io/Red-teaming/writeups/02_direct_prompt_injection)
- [Ajuste supervisionado do Gemini (Vertex AI)](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/gemini-supervised-tuning)
- [Descontinuações da OpenAI, incluindo fine-tuning](https://developers.openai.com/api/docs/deprecations)
