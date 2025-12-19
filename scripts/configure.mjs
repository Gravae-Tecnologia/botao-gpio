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

  const rl = readline.createInterface({ input: stdin, output: stdout });

  const apiKey =
    (await rl.question(`Chave da API [${defaultApiKey || "nenhuma"}]: `)) ||
    defaultApiKey;
  const groupKey =
    (await rl.question(`Chave do grupo [${defaultGroupKey || "nenhuma"}]: `)) ||
    defaultGroupKey;

  // ordem fixa de GPIO solicitada pelo usuário
  const GPIO_ORDER = [26, 19, 13, 6, 5, 21, 20, 16];
  const defaultCountStr = "4";
  const countStr = await rl.question(
    `Quantos botões deseja configurar? [${defaultCountStr}]: `
  );
  let count = parseInt(countStr || defaultCountStr);
  if (Number.isNaN(count) || count < 0) count = parseInt(defaultCountStr);
  if (count > GPIO_ORDER.length) count = GPIO_ORDER.length;

  const buttons = {};
  console.log(
    "Agora configure cada botão seguindo a ordem de pinos:",
    GPIO_ORDER.join(" | ")
  );
  for (let i = 0; i < count; i++) {
    const pin = String(GPIO_ORDER[i]);
    const slugsInput = (
      await rl.question(
        `Slugs do monitor para o pino ${pin} (separados por vírgula, deixe vazio para pular): `
      )
    ).trim();
    const slugs = slugsInput
      ? slugsInput
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
    if (slugs.length > 0) buttons[pin] = { monitorSlugs: slugs };
  }

  if (Object.keys(buttons).length === 0) {
    console.log(
      "Nenhum botão configurado. As entradas existentes em BUTTONS serão preservadas se estiverem presentes."
    );
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

export type ButtonConfig = {
  monitorSlugs: string[];
};

export const SITE: SiteConfig = {
  apiKey: ${JSON.stringify(apiKey)},
  groupKey: ${JSON.stringify(groupKey)},
};

export const BUTTONS: Partial<Record<GPIO, ButtonConfig>> = ${JSON.stringify(
    buttons,
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

      const pm2StartCmd = `pm2 start dist/botao.js --name botao --update-env`;
      console.log(`Iniciando com PM2: ${pm2StartCmd}...`);
      await runCommand(pm2StartCmd);

      console.log("Salvando processo PM2 (pm2 save)...");
      await runCommand("pm2 save");

      console.log(
        'Aplicação iniciada com PM2 com nome "botao". Verifique com: pm2 status'
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
