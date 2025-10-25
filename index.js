// VoxTrace — Version sans fichiers + commandes globales + logs en direct par salon vocal
import 'dotenv/config';
import {
  Client, GatewayIntentBits, Partials, ChannelType,
  REST, Routes, SlashCommandBuilder, PermissionFlagsBits,
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ComponentType, OverwriteType
} from 'discord.js';

// ============================ CONFIG EN MÉMOIRE (pas de fichiers) ============================
const config = {
  // salon de logs "général" (fallback) par guilde : { [guildId]: textChannelId }
  logChannels: {},
  // mapping "salon vocal -> salon texte de logs" par guilde : { [guildId]: { [voiceId]: textChannelId } }
  perVoiceLogs: {},
};

// ============================ UTILS ============================
const safeName = s => String(s).replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').slice(0, 64);
const ts = (d = new Date(), style = 'f') => `<t:${Math.floor(d.getTime() / 1000)}:${style}>`;

// ============================ DISCORD CLIENT ============================
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
  partials: [Partials.GuildMember, Partials.User],
});

// ============================ COMMANDES (GLOBAL) ============================
const commandBuilders = [
  new SlashCommandBuilder()
    .setName('setlogchannel')
    .setDescription('Définir le salon texte pour les logs en direct (fallback)')
    .addChannelOption(o =>
      o.setName('salon')
        .setDescription('Salon texte où afficher les logs généraux')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  new SlashCommandBuilder()
    .setName('mystats')
    .setDescription('Afficher tes statistiques vocales (sans fichiers, placeholder propre)'),

  new SlashCommandBuilder()
    .setName('help')
    .setDescription('Afficher toutes les commandes et explications de VoxTrace'),
].map(c => c.toJSON());

async function registerCommandsGlobal() {
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commandBuilders });
  console.log('✅ Commandes globales publiées');
}

// ============================ INFRA PAR GUILDE ============================
async function ensureVoxTraceInfra(guild) {
  // Permissions : visibles par le bot + tous rôles contenant "admin"
  const adminRoles = guild.roles.cache.filter(r => /admin/i.test(r.name));
  const overwrites = [
    { id: guild.roles.everyone, deny: ['ViewChannel'], type: OverwriteType.Role },
    ...adminRoles.map(r => ({ id: r.id, allow: ['ViewChannel'], type: OverwriteType.Role })),
    { id: guild.members.me.id, allow: ['ViewChannel'], type: OverwriteType.Member },
  ];

  // Catégorie VoxTrace
  let category = guild.channels.cache.find(
    ch => ch.type === ChannelType.GuildCategory && ch.name.toLowerCase() === 'voxtrace'
  );
  if (!category) {
    category = await guild.channels.create({
      name: 'VoxTrace',
      type: ChannelType.GuildCategory,
      permissionOverwrites: overwrites,
      reason: 'Catégorie VoxTrace (auto)',
    });
  }

  // Salon général de logs (fallback)
  let logCh =
    config.logChannels[guild.id] && guild.channels.cache.get(config.logChannels[guild.id]);
  if (!logCh || logCh.type !== ChannelType.GuildText) {
    logCh = await guild.channels.create({
      name: 'voxtrace-logs',
      type: ChannelType.GuildText,
      parent: category.id,
      permissionOverwrites: overwrites,
      reason: 'Salon général de logs VoxTrace',
    });
    config.logChannels[guild.id] = logCh.id;
  }

  return { category, overwrites, logCh };
}

async function ensurePerVoiceLogsForGuild(guild) {
  const { category, overwrites } = await ensureVoxTraceInfra(guild);
  if (!config.perVoiceLogs[guild.id]) config.perVoiceLogs[guild.id] = {};

  // Pour chaque salon vocal existant → créer un salon de logs dédié s'il manque
  const voices = guild.channels.cache.filter(ch => ch.type === ChannelType.GuildVoice);
  for (const voice of voices.values()) {
    const currentId = config.perVoiceLogs[guild.id][voice.id];
    const current = currentId && guild.channels.cache.get(currentId);
    if (current && current.type === ChannelType.GuildText) continue;

    const shortId = voice.id.slice(-4);
    const logName = `log-${safeName(voice.name).toLowerCase()}-${shortId}`;
    const textLog = await guild.channels.create({
      name: logName,
      type: ChannelType.GuildText,
      parent: category.id,
      permissionOverwrites: overwrites,
      reason: `Salon de logs pour ${voice.name}`,
    });
    config.perVoiceLogs[guild.id][voice.id] = textLog.id;
  }
}

function getTextLogForVoice(guild, voiceId) {
  const id = config.perVoiceLogs[guild.id]?.[voiceId] || config.logChannels[guild.id];
  return id ? guild.channels.cache.get(id) : null;
}

// ============================ READY ============================
client.once('ready', async () => {
  console.log(`✅ Connecté en tant que ${client.user.tag}`);
  await registerCommandsGlobal();

  // Prépare l'infra et les logs par salon vocal pour TOUTES les guildes
  for (const guild of client.guilds.cache.values()) {
    try {
      await ensureVoxTraceInfra(guild);
      await ensurePerVoiceLogsForGuild(guild);
    } catch (e) {
      console.error('Infra error', guild.name, e);
    }
  }
});

// ============================ GUILD JOIN / LEAVE ============================
client.on('guildCreate', async guild => {
  try {
    await ensureVoxTraceInfra(guild);
    await ensurePerVoiceLogsForGuild(guild);
  } catch (e) {
    console.error('guildCreate error', guild.name, e);
  }
});

client.on('guildDelete', async guild => {
  try {
    const cat = guild.channels.cache.find(
      ch => ch.type === ChannelType.GuildCategory && ch.name.toLowerCase() === 'voxtrace'
    );
    if (cat) await cat.delete('VoxTrace: bot retiré, suppression de la catégorie');
  } catch {}
  delete config.logChannels[guild.id];
  delete config.perVoiceLogs[guild.id];
});

// ============================ CHANNEL CREATE / DELETE (VOCAL) ============================
client.on('channelCreate', async channel => {
  if (channel.type !== ChannelType.GuildVoice) return;
  try {
    await ensurePerVoiceLogsForGuild(channel.guild);
  } catch (e) {
    console.error('channelCreate error', e);
  }
});

client.on('channelDelete', async channel => {
  if (channel.type !== ChannelType.GuildVoice) return;
  try {
    const gid = channel.guild.id;
    const textId = config.perVoiceLogs[gid]?.[channel.id];
    if (textId) {
      const textCh = channel.guild.channels.cache.get(textId);
      if (textCh) await textCh.delete('VoxTrace: vocal supprimé');
      delete config.perVoiceLogs[gid][channel.id];
    }
  } catch (e) {
    console.error('channelDelete error', e);
  }
});

// ============================ LOGS EN DIRECT (voiceStateUpdate) ============================
client.on('voiceStateUpdate', async (oldS, newS) => {
  const guild = newS.guild || oldS.guild;
  const member = newS.member || oldS.member;
  if (!guild || !member || member.user.bot) return;

  const now = new Date();
  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTimestamp(now)
    .setAuthor({ name: member.user.tag, iconURL: member.user.displayAvatarURL() });

  // JOIN
  if (!oldS.channelId && newS.channelId) {
    embed.setDescription(`🟢 **Join** ${member} a rejoint **${newS.channel?.name}** (${ts(now, 'T')})\nID vocal: \`${newS.channelId}\``);
    await ensurePerVoiceLogsForGuild(guild);
    getTextLogForVoice(guild, newS.channelId)?.send({ embeds: [embed] }).catch(()=>{});
  }
  // LEAVE
  else if (oldS.channelId && !newS.channelId) {
    embed.setDescription(`🔴 **Leave** ${member} a quitté **${oldS.channel?.name}** (${ts(now, 'T')})\nID vocal: \`${oldS.channelId}\``);
    getTextLogForVoice(guild, oldS.channelId)?.send({ embeds: [embed] }).catch(()=>{});
  }
  // MOVE
  else if (oldS.channelId && newS.channelId && oldS.channelId !== newS.channelId) {
    embed.setDescription(`🔁 **Switch** ${member} : **${oldS.channel?.name}** → **${newS.channel?.name}** (${ts(now,'T')})\nFrom: \`${oldS.channelId}\` → To: \`${newS.channelId}\``);
    getTextLogForVoice(guild, oldS.channelId)?.send({ embeds: [embed] }).catch(()=>{});
    getTextLogForVoice(guild, newS.channelId)?.send({ embeds: [embed] }).catch(()=>{});
  }

  // MUTE / UNMUTE
  if (oldS.selfMute !== newS.selfMute) {
    const vId = newS.channelId || oldS.channelId;
    if (vId) {
      embed.setDescription(`${newS.selfMute ? '🔇' : '🔊'} **${newS.selfMute ? 'Mute' : 'Unmute'}** ${member} (${ts(now,'T')})\nID vocal: \`${vId}\``);
      getTextLogForVoice(guild, vId)?.send({ embeds: [embed] }).catch(()=>{});
    }
  }
  // DEAF / UNDEAF
  if (oldS.selfDeaf !== newS.selfDeaf) {
    const vId = newS.channelId || oldS.channelId;
    if (vId) {
      embed.setDescription(`${newS.selfDeaf ? '🔕' : '🔔'} **${newS.selfDeaf ? 'Casque OFF' : 'Casque ON'}** ${member} (${ts(now,'T')})\nID vocal: \`${vId}\``);
      getTextLogForVoice(guild, vId)?.send({ embeds: [embed] }).catch(()=>{});
    }
  }
  // CAMERA
  if (oldS.selfVideo !== newS.selfVideo) {
    const vId = newS.channelId || oldS.channelId;
    if (vId) {
      embed.setDescription(`${newS.selfVideo ? '📷' : '📷'} **${newS.selfVideo ? 'Caméra ON' : 'Caméra OFF'}** ${member} (${ts(now,'T')})\nID vocal: \`${vId}\``);
      getTextLogForVoice(guild, vId)?.send({ embeds: [embed] }).catch(()=>{});
    }
  }
  // STREAM
  if (oldS.streaming !== newS.streaming) {
    const vId = newS.channelId || oldS.channelId;
    if (vId) {
      embed.setDescription(`${newS.streaming ? '🟣' : '⚪'} **${newS.streaming ? 'Stream ON' : 'Stream OFF'}** ${member} (${ts(now,'T')})\nID vocal: \`${vId}\``);
      getTextLogForVoice(guild, vId)?.send({ embeds: [embed] }).catch(()=>{});
    }
  }
});

// ============================ INTERACTIONS ============================
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const { guild, user } = interaction;
  if (!guild) return;

  try {
    // IMPORTANT pour éviter "L'application ne répond plus"
    await interaction.deferReply({ ephemeral: true });

    // /help (tout le monde)
    if (interaction.commandName === 'help') {
      const pages = [
        new EmbedBuilder()
          .setTitle('📋 VoxTrace — Général')
          .setDescription('Surveille toutes les activités vocales et les envoie en direct **par salon vocal**.\nAucune sauvegarde sur disque.')
          .setColor(0x5865F2),

        new EmbedBuilder()
          .setTitle('⚙️ Configuration (Admins)')
          .setDescription('• `/setlogchannel salon:#logs` → change le salon général de logs (fallback)\n\nLes salons `log-...` sont créés automatiquement pour chaque salon vocal.')
          .setColor(0x57F287),

        new EmbedBuilder()
          .setTitle('👥 Commandes utilisateurs')
          .setDescription('• `/mystats` → placeholder propre (pas de DB, pas de fichiers)\n• `/help` → cette aide (paginée, privée)')
          .setColor(0xFEE75C),
      ];
      let i = 0;
      const row = j => new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('prev').setEmoji('◀️').setStyle(ButtonStyle.Secondary).setDisabled(j===0),
        new ButtonBuilder().setCustomId('next').setEmoji('▶️').setStyle(ButtonStyle.Secondary).setDisabled(j===pages.length-1),
        new ButtonBuilder().setCustomId('stop').setEmoji('🛑').setStyle(ButtonStyle.Danger)
      );
      const msg = await interaction.editReply({ embeds: [pages[i]], components: [row(i)] });
      const col = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 180000, filter: b => b.user.id === user.id });
      col.on('collect', async b => {
        if (b.customId === 'prev') i = Math.max(0, i - 1);
        if (b.customId === 'next') i = Math.min(pages.length - 1, i + 1);
        if (b.customId === 'stop') return col.stop();
        await b.update({ embeds: [pages[i]], components: [row(i)] });
      });
      col.on('end', () => msg.edit({ components: [] }).catch(()=>{}));
      return;
    }

    // /setlogchannel (Admins)
    if (interaction.commandName === 'setlogchannel') {
      const ch = interaction.options.getChannel('salon', true);
      if (ch.type !== ChannelType.GuildText) {
        return void interaction.editReply('❌ Le salon choisi doit être **un salon texte**.');
      }
      config.logChannels[guild.id] = ch.id;
      await interaction.editReply(`✅ Salon de logs général défini sur : ${ch}`);
      return;
    }

    // /mystats (placeholder propre)
    if (interaction.commandName === 'mystats') {
      const periods = ['24h', '7d', '30d', '3w'];
      const build = label => new EmbedBuilder()
        .setTitle(`📊 Stats de ${user.username} — ${label}`)
        .setDescription(`(Sans stockage de fichiers / base de données)\n\n*Cette section est prête si tu veux brancher une DB plus tard.*`)
        .setColor(0x5865F2);

      let current = 0;
      const row = idx => new ActionRowBuilder().addComponents(
        periods.map((p, i) =>
          new ButtonBuilder().setCustomId(`p${i}`).setLabel(p).setStyle(i === idx ? ButtonStyle.Primary : ButtonStyle.Secondary)
        )
      );
      const msg = await interaction.editReply({ embeds: [build(periods[current])], components: [row(current)] });
      const col = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 180000, filter: b => b.user.id === user.id });
      col.on('collect', async b => {
        const idx = parseInt(b.customId.replace('p',''), 10);
        current = idx;
        await b.update({ embeds: [build(periods[current])], components: [row(current)] });
      });
      col.on('end', () => msg.edit({ components: [] }).catch(()=>{}));
      return;
    }

    // fallback
    await interaction.editReply('❔ Commande non reconnue.');
  } catch (err) {
    console.error('Erreur commande:', err);
    if (!interaction.replied) {
      await interaction.reply({ content: '❌ Une erreur est survenue.', ephemeral: true }).catch(()=>{});
    }
  }
});

// ============================ LOGIN ============================
client.login(process.env.DISCORD_TOKEN);
