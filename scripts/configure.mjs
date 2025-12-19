import fs from "fs/promises";
import readline from "readline/promises";
import { stdin, stdout } from "process";
import { exec } from "child_process";

async function readExisting() {
  try {
    return await fs.readFile("src/config.ts", "utf8");
  } catch {
    return "";
  }
}

function extractDefault(content, key) {
  const re = new RegExp(`${key}:\\s*"([^"]*)"`);
  const m = content.match(re);
  return m ? m[1] : "";
}

function runCommand(cmd) {
  return new Promise((resolve, reject) => {
    const p = exec(cmd, { maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        console.error(`Erro ao executar \'${cmd}\'`, stderr || err.message);
        return reject(err);
      }
      if (stdout) console.log(stdout);
      resolve();
    });
    if (p.stdout) p.stdout.pipe(process.stdout);
    if (p.stderr) p.stderr.pipe(process.stderr);
  });
}

async function main() {
  const existing = await readExisting();
  const defaultApiKey = extractDefault(existing, "apiKey");
  const defaultGroupKey = extractDefault(existing, "groupKey");

  // tenta extrair BUTTONS existentes por pino (cada pino -> array de monitor slugs)
  function parseExistingButtons(content) {
    const map = {};
    // localizar o objeto literal de export const BUTTONS
    const marker = "export const BUTTONS";
    const idx = content.indexOf(marker);
    if (idx === -1) return map;
    const braceStart = content.indexOf("{", idx);
    if (braceStart === -1) return map;
    // encontrar o '}' correspondente do objeto
    let pos = braceStart;
    let depth = 0;
    let endPos = -1;
    for (; pos < content.length; pos++) {
      const ch = content[pos];
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          endPos = pos;
          break;
        }
      }
    }
    if (endPos === -1) return map;
    let objText = content.slice(braceStart, endPos + 1);
    // transformar em JSON válido:
    // - substituir aspas simples por duplas
    // - colocar chaves numéricas sem aspas em aspas
    // - remover trailing commas
    objText = objText.replace(/'/g, '"');
    objText = objText.replace(/(\b\d+\b)\s*:/g, '"$1":');
    objText = objText.replace(/,\s*([}\]])/g, "$1");
    try {
      const parsed = JSON.parse(objText);
      for (const [k, v] of Object.entries(parsed)) {
        if (Array.isArray(v) && v.length) map[k] = v.map(String);
        else if (v && Array.isArray(v.monitorSlugs) && v.monitorSlugs.length)
          map[k] = v.monitorSlugs.map(String);
      }
    } catch (e) {
      // se parsing falhar, retornar mapa vazio
    }
    return map;
  }

  const existingButtons = parseExistingButtons(existing);

  const rl = readline.createInterface({ input: stdin, output: stdout });

  const apiKey =
    (await rl.question(`apiKey [${defaultApiKey || "nenhuma"}]: `)) ||
    defaultApiKey;
  const groupKey =
    (await rl.question(`groupKey [${defaultGroupKey || "nenhuma"}]: `)) ||
    defaultGroupKey;

  // ordem fixa de GPIO solicitada pelo usuário
  const GPIO_ORDER = [26, 19, 13, 6, 5, 21, 20, 16];
  // Decidir quais pinos revisar: se já existe configuração, oferecer limitar a revisão
  let pinsToReview = [];
  const orderedExistingPins = GPIO_ORDER.map(String).filter(
    (p) => existingButtons[p]
  );
  if (orderedExistingPins.length > 0) {
    console.log(
      "Configuração existente detectada — há",
      orderedExistingPins.length,
      "pinos configurados."
    );
    const defaultCountStr = String(orderedExistingPins.length);
    const countStr = await rl.question(
      `Quantos desses botões deseja revisar agora? [${defaultCountStr}] (pressione Enter para revisar todos): `
    );
    let count = parseInt(countStr || defaultCountStr);
    if (Number.isNaN(count) || count < 0) count = orderedExistingPins.length;
    if (count > GPIO_ORDER.length) count = GPIO_ORDER.length;

    if (count <= orderedExistingPins.length) {
      // revisar apenas os primeiros N pinos existentes
      pinsToReview = orderedExistingPins.slice(0, count);
    } else {
      // revisar todos os existentes e adicionar próximos pinos não configurados até count
      const remaining = GPIO_ORDER.map(String).filter(
        (p) => !orderedExistingPins.includes(p)
      );
      pinsToReview = orderedExistingPins.concat(
        remaining.slice(0, count - orderedExistingPins.length)
      );
    }
  } else {
    // sem configuração existente: perguntar quantos criar
    const defaultCountStr = "4";
    const countStr = await rl.question(
      `Quantos botões deseja configurar? [${defaultCountStr}]: `
    );
    let count = parseInt(countStr || defaultCountStr);
    if (Number.isNaN(count) || count < 0) count = parseInt(defaultCountStr);
    if (count > GPIO_ORDER.length) count = GPIO_ORDER.length;
    pinsToReview = GPIO_ORDER.slice(0, count).map(String);
  }

  const buttons = {};
  console.log("Agora configure os pinos:", pinsToReview.join(" | "));
  for (const pin of pinsToReview) {
    const defaultForPin = (existingButtons[pin] || []).join(", ");
    const prompt = defaultForPin
      ? `Slugs do monitor para o pino ${pin} (separados por vírgula) [${defaultForPin}]: `
      : `Slugs do monitor para o pino ${pin} (separados por vírgula, deixe vazio para pular): `;
    const slugsInput = (await rl.question(prompt)).trim();
    const slugs = slugsInput
      ? slugsInput
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : defaultForPin
      ? defaultForPin
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
    if (slugs.length > 0) buttons[pin] = slugs;
  }

  if (Object.keys(buttons).length === 0) {
    console.log(
      "Nenhum botão configurado. As entradas existentes em BUTTONS serão preservadas se estiverem presentes."
    );
  }

  // Construir finalButtons somente com os pinos que foram revisados (preservando valores quando Enter)
  const finalButtons = {};
  for (const p of pinsToReview) {
    if (buttons[p]) finalButtons[p] = buttons[p];
    else if (existingButtons[p]) finalButtons[p] = existingButtons[p];
    // se nenhum dos dois existir, o pino é ignorado
  }

  const output = `export type GPIO = 26 | 19 | 13 | 6 | 5 | 21 | 20 | 16;
 
export const SHINOBI_BASE_URL = "http://127.0.0.1:8080";
 
export const DEBOUNCE_MS = 200;
export const COOLDOWN_MS = 5000;
export const HTTP_TIMEOUT_MS = 3000;
 
export const REGION_NAME = "gpio_button";
export const CONFIDENCE = 197.4755859375;
 
export type SiteConfig = {
  apiKey: string;
  groupKey: string;
};
 
export type ButtonConfig = string[];
 

export const SITE: SiteConfig = {
  apiKey: ${JSON.stringify(apiKey)},
  groupKey: ${JSON.stringify(groupKey)},
 };
 
export const BUTTONS: Partial<Record<GPIO, ButtonConfig>> = ${JSON.stringify(
    finalButtons,
    null,
    2
  )};
`;

  await fs.writeFile("src/config.ts", output, "utf8");
  console.log("Configuração salva em src/config.ts");

  const deployAns = (
    await rl.question("Deseja compilar e iniciar com PM2 agora? (S/n): ")
  )
    .trim()
    .toLowerCase();
  // tratar entrada vazia como 'sim' (padrão S)
  const doDeploy =
    deployAns === "" ||
    deployAns === "s" ||
    deployAns === "sim" ||
    deployAns === "y" ||
    deployAns === "yes";

  if (doDeploy) {
    try {
      // detectar gerenciador de pacotes
      let pkgManager = "npm";
      try {
        await fs.access("yarn.lock");
        pkgManager = "yarn";
      } catch {}

      const buildCmd = pkgManager === "yarn" ? "yarn build" : "npm run build";
      console.log(`Executando: ${buildCmd}...`);
      await runCommand(buildCmd);

      const pm2StartCmd = `pm2 start dist/botao.js --name button --update-env`;
      console.log(`Iniciando com PM2: ${pm2StartCmd}...`);
      await runCommand(pm2StartCmd);

      console.log("Salvando processo PM2 (pm2 save)...");
      await runCommand("pm2 save");

      console.log(
        'Aplicação iniciada com PM2 com nome "button". Verifique com: pm2 status'
      );
    } catch (err) {
      console.error("Falha ao compilar/iniciar com PM2:", err);
    }
  }

  rl.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
