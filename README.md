# botao-gpio → Shinobi (Raspberry Pi)

Serviço em **TypeScript/Node.js** para Raspberry Pi que monitora botões físicos via **GPIO** e dispara o endpoint de **motion trigger** do **Shinobi** (por padrão em `http://127.0.0.1:8080`) para um ou mais monitores.

Repo: https://github.com/Gravae-Tecnologia/botao-gpio

## O que ele faz

- Monitora GPIOs com detecção de borda **falling** (botão em pull-up)
- Aplica **debounce** (anti-ruído) e **cooldown** por pino (anti-spam)
- Ao pressionar um botão, dispara 1 ou mais `monitorSlugs` no Shinobi via HTTP GET
- Loga cada disparo em `logs/button_presses_details.txt`
- Fecha GPIO corretamente em SIGINT/SIGTERM
- Requests HTTP não bloqueiam o loop (fire-and-forget)

---

## Requisitos

- Raspberry Pi OS / Debian
- **Node.js 18+**
- Shinobi rodando localmente em `http://127.0.0.1:8080` (ou ajuste `SHINOBI_BASE_URL` em `src/config.ts`)
- PM2 instalado globalmente (`npm i -g pm2`) para execução em produção (opcional, mas recomendado)
- Acesso a GPIO (pode exigir permissões/grupo dependendo do OS)

---

## Instalação

```bash
git clone https://github.com/Gravae-Tecnologia/botao-gpio
cd botao-gpio
yarn
```

---

## Configuração

A configuração agora fica em `src/config.ts`. Há duas formas de editar:

1) Interativo (recomendado)

- Execute:

```bash
yarn button:config
```

- O script fará perguntas (API key, group key e monitor slugs por pino) e grava `src/config.ts`. No final ele oferece compilar e iniciar com PM2 automaticamente (padrão: S).

- Ordem fixa de GPIO usada pelo assistente interativo (quando você pergunta quantos botões quer configurar):

```
26 | 19 | 13 | 6 | 5 | 21 | 20 | 16
```

2) Manual

- Edite `src/config.ts` diretamente. O arquivo contém tipos e constantes:

- SITE: apiKey e groupKey
- BUTTONS: mapa parcial de pinos → { monitorSlugs: string[] }
- SHINOBI_BASE_URL, DEBOUNCE_MS, COOLDOWN_MS, HTTP_TIMEOUT_MS, REGION_NAME, CONFIDENCE

Exemplo (manual):

```ts
export const SITE = {
  apiKey: "SEU_API_KEY",
  groupKey: "SEU_GROUP_KEY",
};

export const BUTTONS = {
  26: { monitorSlugs: ["cancha01_camera01"] },
  19: { monitorSlugs: ["cancha02_camera01"] },
  13: { monitorSlugs: ["cancha03_camera01"] },
  6:  { monitorSlugs: ["cancha04_camera01", "cancha04_camera02"] },
};
```

---

## Parâmetros importantes

- DEBOUNCE_MS: anti-ruído do botão (padrão 200)
- COOLDOWN_MS: trava de repetição por pino (padrão 5000)
- HTTP_TIMEOUT_MS: timeout do request (padrão 3000)

---

## Build e execução

Compile o projeto (gera `dist/botao.js`):

```bash
yarn build
```

Testar localmente (debug):

```bash
node dist/botao.js
```

Saída esperada:

- `🟢 Iniciando botões GPIO...`
- `✅ Botões ativos`

Ao apertar um botão:

- `🔘 Aperto registrado na <monitorSlug> (<pin>)`
- `✔ <monitorSlug> → 200`

---

## Rodar com PM2 (produção)

O script interativo pode compilar e iniciar com PM2 automaticamente. Se preferir fazer manualmente:

### Iniciar

```bash
pm2 start dist/botao.js --name botao
pm2 save
pm2 list
```

ou (modo compatível com npm script):

```bash
pm2 start "npm run start" --name botao-gpio
pm2 save
```

### Logs

```bash
pm2 logs botao
# ou
pm2 logs botao-gpio
```

### Restart / Stop

```bash
pm2 restart botao
pm2 stop botao
```

### Auto-start no boot (uma vez)

```bash
pm2 startup
# copie e rode o comando que o PM2 imprimir (com sudo)
pm2 save
```

---

## Logs (arquivo)

- Arquivo: `logs/button_presses_details.txt`
- Formato:
```
2025-12-16T13:10:00.123Z - cancha04_camera01
```

---

## Troubleshooting

### Nada acontece ao apertar o botão

- Confirme pino correto em `src/config.ts` (`BUTTONS`)
- Confirme wiring (GPIO + GND)
- Confirme se o Shinobi responde:

```bash
curl -I http://127.0.0.1:8080/
```

### Permission denied / erro de GPIO

- Teste rodando como root (apenas para diagnosticar)
- Ajuste permissões/grupo do usuário dependendo do OS

### Request falha (timeout/ECONNREFUSED)

- Shinobi caiu
- Porta diferente de 8080
- apiKey / groupKey errados
- monitorSlug errado

---

## Segurança

Esse projeto chama `localhost`. Não exponha o Shinobi publicamente sem proteção (auth + reverse proxy + firewall).

---

## Licença

Defina a licença do repositório (MIT/Apache-2.0/etc) ou remova esta seção.
