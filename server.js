const express = require('express');
const { WebSocketServer } = require('ws');
const { Client, GatewayIntentBits } = require('discord.js');

// ============================================
// CONFIG
// ============================================

const PORT = process.env.PORT || 3000;
const DISCORD_TOKEN = process.env.DISCORD_TOKEN; // Set di Railway
const ADMIN_USER_ID = process.env.ADMIN_USER_ID || ''; // Optional: ID Discord kamu

// ============================================
// BRANDING
// ============================================

const BRAND_TAG = '**🛠️ Developer: celo x ryu**';
const BRAND_FOOTER = { text: '🛠️ Developer: celo x ryu' };

// ============================================
// STATE
// ============================================

let currentMode = 'k'; // Default: KECIL
let modeQueue = []; // Antrian mode
let queueIndex = 0; // Index antrian saat ini
let customTarget = null; // ⭐ Custom target
let customQueue = []; // ⭐ NEW: Queue of custom numbers
let customQueueIndex = 0; // ⭐ NEW: Custom queue index

// ============================================
// EXPRESS SERVER
// ============================================

const app = express();

app.get('/', (req, res) => {
  res.json({
    status: 'online',
    currentMode: currentMode,
    queue: modeQueue,
    queueIndex: queueIndex,
    customTarget: customTarget,
    customQueue: customQueue,
    customQueueIndex: customQueueIndex,
    timestamp: new Date().toISOString(),
  });
});

app.get('/mode', (req, res) => {
  res.json({
    mode: currentMode,
    queue: modeQueue,
    queueIndex: queueIndex,
    customTarget: customTarget,
    customQueue: customQueue,
    customQueueIndex: customQueueIndex,
  });
});

const server = app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});

// ============================================
// WEBSOCKET SERVER
// ============================================

const wss = new WebSocketServer({ server });
const clients = new Set();

wss.on('connection', (ws) => {
  console.log('🔌 Client connected');
  clients.add(ws);

  // Send current state immediately
  ws.send(
    JSON.stringify({
      type: 'mode',
      mode: currentMode,
      queue: modeQueue,
      queueIndex: queueIndex,
      timestamp: Date.now(),
    }),
  );

  // ⭐ Send custom target if exists
  if (customTarget !== null) {
    ws.send(
      JSON.stringify({
        type: 'custom',
        target: customTarget,
        timestamp: Date.now(),
      }),
    );
  }

  // ⭐ Send custom queue if exists
  if (customQueue.length > 0) {
    ws.send(
      JSON.stringify({
        type: 'customQueue',
        queue: customQueue,
        queueIndex: customQueueIndex,
        timestamp: Date.now(),
      }),
    );
  }

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);
      // Handle roll notification from client
      if (message.type === 'roll_complete') {
        handleRollComplete();
      }
    } catch (e) {
      console.error('Failed to parse client message:', e);
    }
  });

  ws.on('close', () => {
    console.log('🔌 Client disconnected');
    clients.delete(ws);
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
    clients.delete(ws);
  });
});

// Broadcast mode to all connected clients
function broadcastMode(mode, queueEmpty = false) {
  const message = JSON.stringify({
    type: 'mode',
    mode: mode,
    queue: modeQueue,
    queueIndex: queueIndex,
    queueEmpty: queueEmpty,
    timestamp: Date.now(),
  });

  clients.forEach((client) => {
    if (client.readyState === 1) {
      // OPEN
      client.send(message);
    }
  });

  console.log(`📢 Broadcasted mode: ${mode.toUpperCase()} to ${clients.size} clients`);
  if (queueEmpty) {
    console.log('⚠️ Queue is now empty!');
  }
}

// ⭐ NEW: Broadcast custom target
function broadcastCustomTarget(target) {
  const message = JSON.stringify({
    type: 'custom',
    target: target,
    timestamp: Date.now(),
  });

  clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(message);
    }
  });

  console.log(`🎯 Broadcasted custom target: ${target} to ${clients.size} clients`);
}

// ⭐ NEW: Broadcast custom queue
function broadcastCustomQueue(queue, index, queueEmpty = false) {
  const message = JSON.stringify({
    type: 'customQueue',
    queue: queue,
    queueIndex: index,
    queueEmpty: queueEmpty,
    timestamp: Date.now(),
  });

  clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(message);
    }
  });

  console.log(
    `📋 Broadcasted custom queue: [${queue.join(',')}] (${index}/${queue.length}) to ${clients.size} clients`,
  );
  if (queueEmpty) {
    console.log('⚠️ Custom queue is now empty!');
  }
}

// Handle roll completion and queue advancement
function handleRollComplete() {
  // ⭐ Clear custom target after use
  if (customTarget !== null) {
    customTarget = null;
    console.log('✅ Custom target cleared after roll');
  }

  // ⭐ Handle custom queue
  if (customQueue.length > 0) {
    customQueueIndex++;
    if (customQueueIndex >= customQueue.length) {
      // Custom queue finished
      console.log('✅ Custom queue completed!');
      customQueue = [];
      customQueueIndex = 0;
      broadcastCustomQueue([], 0, true);
    } else {
      // Move to next custom in queue
      customTarget = customQueue[customQueueIndex];
      console.log(
        `🔄 Custom queue advance: ${customTarget} (${customQueueIndex + 1}/${customQueue.length})`,
      );
      broadcastCustomTarget(customTarget);
      broadcastCustomQueue(customQueue, customQueueIndex, false);
    }
    return;
  }

  if (modeQueue.length === 0) return;

  queueIndex++;
  if (queueIndex >= modeQueue.length) {
    // Queue finished
    console.log('✅ Queue completed!');
    modeQueue = [];
    queueIndex = 0;
    broadcastMode(currentMode, true); // Send queue empty signal
  } else {
    // Move to next mode in queue
    currentMode = modeQueue[queueIndex];
    console.log(
      `🔄 Queue advance: ${currentMode.toUpperCase()} (${queueIndex + 1}/${modeQueue.length})`,
    );
    broadcastMode(currentMode);
  }
}

// ============================================
// DISCORD BOT
// ============================================

const discord = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

discord.on('ready', () => {
  console.log(`🤖 Bot logged in as ${discord.user.tag}`);
  console.log(`📊 Current mode: ${currentMode.toUpperCase()}`);
});

discord.on('messageCreate', async (message) => {
  // Ignore bot messages
  if (message.author.bot) return;

  const content = message.content.toLowerCase().trim();

  // ⭐ NEW: Command: !custom 38
  if (content.startsWith('!custom ')) {
    const targetStr = content.split(' ')[1];
    const target = parseInt(targetStr);

    if (isNaN(target)) {
      return message.reply(`${BRAND_TAG}\n❌ Invalid number! Use: \`!custom 38\``);
    }

    if (target < 9 || target > 54) {
      return message.reply(
        `${BRAND_TAG}\n❌ Target must be between **9** and **54**!\n(9 dadu minimum = 9, maximum = 54)`,
      );
    }

    // Set custom target
    customTarget = target;
    broadcastCustomTarget(target);

    const embed = {
      color: 0xff00ff,
      title: '🎯 Custom Target Set',
      description: `Next roll will aim for **${target}** ⚡`,
      fields: [
        {
          name: '🎲 How it works',
          value: 'Dice will be randomly generated but adjusted to hit exact target',
          inline: false,
        },
        {
          name: '✨ Natural Pattern',
          value: 'Individual dice stay random & varied',
          inline: false,
        },
        {
          name: '⚠️ One-Time Use',
          value: 'Target cleared after next roll',
          inline: false,
        },
      ],
      footer: BRAND_FOOTER,
      timestamp: new Date().toISOString(),
    };

    await message.reply({
      content: BRAND_TAG,
      embeds: [embed],
    });
    return;
  }

  // ⭐ NEW: Command: !setcustom 38-22-32
  if (content.startsWith('!setcustom ')) {
    const queueString = content.split(' ')[1];

    if (!queueString) {
      return message.reply(
        `${BRAND_TAG}\n❌ Format: \`!setcustom 38-22-32\` (gunakan - sebagai pemisah)`,
      );
    }

    const numbers = queueString.split('-').map((n) => parseInt(n.trim()));

    // Validate all numbers
    const invalidNumbers = numbers.filter((n) => isNaN(n) || n < 9 || n > 54);
    if (invalidNumbers.length > 0) {
      return message.reply(
        `${BRAND_TAG}\n❌ Number tidak valid! Harus 9-54.\nGunakan format: !setcustom 38-22-32`,
      );
    }

    if (numbers.length === 0) {
      return message.reply(`${BRAND_TAG}\n❌ Queue kosong! Minimal 1 angka.`);
    }

    // Set custom queue
    customQueue = numbers;
    customQueueIndex = 0;
    customTarget = numbers[0];
    modeQueue = []; // Clear mode queue
    queueIndex = 0;

    broadcastCustomTarget(customTarget);
    broadcastCustomQueue(customQueue, customQueueIndex, false);

    const queueDisplay = numbers
      .map((num, i) => {
        const prefix = i === 0 ? '▶️' : i < 3 ? '⏭️' : '⏩';
        return `${prefix} ${num}`;
      })
      .slice(0, 10)
      .join('\n');

    const remaining =
      numbers.length > 10 ? `\n... +${numbers.length - 10} more` : '';

    const embed = {
      color: 0xff00ff,
      title: '✅ Custom Queue Set',
      description: `Total rolls: **${numbers.length}** 🔁`,
      fields: [
        {
          name: '📋 Queue Preview',
          value: queueDisplay + remaining,
          inline: false,
        },
        {
          name: '▶️ Current Target',
          value: `**${customTarget}**`,
          inline: true,
        },
        {
          name: '📊 Progress',
          value: `**1** / **${numbers.length}**`,
          inline: true,
        },
      ],
      footer: BRAND_FOOTER,
      timestamp: new Date().toISOString(),
    };

    await message.reply({
      content: BRAND_TAG,
      embeds: [embed],
    });
    return;
  }

  // Command: !mode k/b/n
  if (content.startsWith('!mode ')) {
    const newMode = content.split(' ')[1];
    if (!['k', 'b', 'n'].includes(newMode)) {
      return message.reply(
        `${BRAND_TAG}\n❌ Invalid mode! Use: \`!mode k\`, \`!mode b\`, or \`!mode n\``,
      );
    }

    // Clear all queues when using single mode
    modeQueue = [];
    queueIndex = 0;
    customTarget = null;
    customQueue = [];
    customQueueIndex = 0;

    currentMode = newMode;
    broadcastMode(newMode);

    const modeNames = { k: 'KECIL ≤31', b: 'BESAR ≥32', n: 'NORMAL' };
    const colors = { k: 0x0099ff, b: 0xff0000, n: 0x808080 };
    const emojis = { k: '🔵', b: '🔴', n: '⚪' };

    const embed = {
      color: colors[newMode],
      title: `${emojis[newMode]} Mode Changed`,
      description: `**${modeNames[newMode]}**`,
      fields: [
        {
          name: '📊 Status',
          value:
            `Mode: **${modeNames[newMode]}**\n` +
            'Queue: **Cleared**\n' +
            'Custom: **Cleared**',
          inline: false,
        },
      ],
      footer: BRAND_FOOTER,
      timestamp: new Date().toISOString(),
    };

    await message.reply({
      content: BRAND_TAG,
      embeds: [embed],
    });
    return;
  }

  // Command: !set k-b-k (renamed from !antri)
  if (content.startsWith('!set ')) {
    const queueString = content.split(' ')[1];

    if (!queueString) {
      return message.reply(
        `${BRAND_TAG}\n❌ Format: \`!set k-b-k\` (gunakan - sebagai pemisah)`,
      );
    }

    const modes = queueString.split('-').map((m) => m.trim().toLowerCase());

    // Validate all modes
    const invalidModes = modes.filter((m) => !['k', 'b', 'n'].includes(m));
    if (invalidModes.length > 0) {
      return message.reply(
        `${BRAND_TAG}\n❌ Mode tidak valid: ${invalidModes.join(
          ', ',
        )}\nGunakan hanya: k, b, n`,
      );
    }

    if (modes.length === 0) {
      return message.reply(`${BRAND_TAG}\n❌ Antrian kosong! Minimal 1 mode.`);
    }

    // Set queue and clear custom
    modeQueue = modes;
    queueIndex = 0;
    customTarget = null;
    customQueue = [];
    customQueueIndex = 0;

    currentMode = modes[0];
    broadcastMode(currentMode);

    const modeNames = { k: 'KECIL ≤31', b: 'BESAR ≥32', n: 'NORMAL' };
    const emojis = { k: '🔵', b: '🔴', n: '⚪' };

    const queueDisplay = modes
      .map((m, i) => {
        const prefix = i === 0 ? '▶️' : i < 3 ? '⏭️' : '⏩';
        return `${prefix} ${modeNames[m]}`;
      })
      .slice(0, 10)
      .join('\n');

    const remaining =
      modes.length > 10 ? `\n... +${modes.length - 10} more` : '';

    const embed = {
      color: 0x00ff00,
      title: '✅ Queue Set Successfully',
      description: `Total rolls: **${modes.length}** 🔄`,
      fields: [
        {
          name: '📋 Queue Preview',
          value: queueDisplay + remaining,
          inline: false,
        },
        {
          name: '▶️ Current Mode',
          value: `**${modeNames[currentMode]}**`,
          inline: true,
        },
        {
          name: '📊 Progress',
          value: `**1** / **${modes.length}**`,
          inline: true,
        },
      ],
      footer: BRAND_FOOTER,
      timestamp: new Date().toISOString(),
    };

    await message.reply({
      content: BRAND_TAG,
      embeds: [embed],
    });
    return;
  }

  // Command: !clear
  if (content === '!clear') {
    if (modeQueue.length === 0 && customTarget === null && customQueue.length === 0) {
      return message.reply(
        `${BRAND_TAG}\nℹ️ Queue, custom target, dan custom queue sudah kosong.`,
      );
    }

    const previousQueueLength = modeQueue.length;
    const previousProgress = queueIndex + 1;
    const hadCustom = customTarget !== null;
    const hadCustomQueue = customQueue.length > 0;
    const previousCustomProgress = customQueueIndex + 1;
    const previousCustomLength = customQueue.length;

    modeQueue = [];
    queueIndex = 0;
    customTarget = null;
    customQueue = [];
    customQueueIndex = 0;

    broadcastMode(currentMode, true);
    broadcastCustomQueue([], 0, true);

    const embed = {
      color: 0xff9900,
      title: '🗑️ Cleared',
      description: 'Queue dan custom target telah dihapus. ✨',
      fields: [
        {
          name: '📊 Previous State',
          value:
            `Mode Queue: **${
              previousQueueLength > 0
                ? `${previousProgress}/${previousQueueLength}`
                : 'Empty'
            }**\n` +
            `Custom Target: **${hadCustom ? 'Active' : 'None'}**\n` +
            `Custom Queue: **${
              hadCustomQueue ? `${previousCustomProgress}/${previousCustomLength}` : 'Empty'
            }**`,
          inline: false,
        },
        {
          name: '✨ Current Status',
          value:
            `Mode tetap: **${currentMode.toUpperCase()}**\n` +
            'All queues: **Empty**',
          inline: false,
        },
      ],
      footer: BRAND_FOOTER,
      timestamp: new Date().toISOString(),
    };

    await message.reply({
      content: BRAND_TAG,
      embeds: [embed],
    });
    return;
  }

  // Command: !status
  if (content === '!status') {
    const modeNames = { k: 'KECIL ≤31', b: 'BESAR ≥32', n: 'NORMAL' };
    const colors = { k: 0x0099ff, b: 0xff0000, n: 0x808080 };
    const emojis = { k: '🔵', b: '🔴', n: '⚪' };

    const uptimeMinutes = Math.floor(process.uptime() / 60);
    const uptimeHours = Math.floor(uptimeMinutes / 60);
    const uptimeDisplay =
      uptimeHours > 0 ? `${uptimeHours}h ${uptimeMinutes % 60}m` : `${uptimeMinutes}m`;

    const fields = [
      {
        name: `${emojis[currentMode]} Current Mode`,
        value: `**${modeNames[currentMode]}**`,
        inline: true,
      },
      {
        name: '🔌 Connected Clients',
        value: `**${clients.size}**`,
        inline: true,
      },
      {
        name: '⏰ Uptime',
        value: `**${uptimeDisplay}**`,
        inline: true,
      },
    ];

    // ⭐ Show custom target if active
    if (customTarget !== null) {
      fields.push({
        name: '🎯 Custom Target',
        value: `**${customTarget}** (next roll)`,
        inline: false,
      });
    }

    // ⭐ Show custom queue if active
    if (customQueue.length > 0) {
      const remainingCustom = customQueue.slice(customQueueIndex);
      const queueDisplay = remainingCustom
        .map((num, i) => {
          const prefix = i === 0 ? '▶️' : i < 3 ? '⏭️' : '⏩';
          return `${prefix} ${num}`;
        })
        .slice(0, 5)
        .join('\n');

      const moreText =
        remainingCustom.length > 5 ? `\n... +${remainingCustom.length - 5} more` : '';

      fields.push({
        name: '📋 Active Custom Queue',
        value: queueDisplay + moreText,
        inline: false,
      });

      fields.push({
        name: '📊 Custom Progress',
        value: `**${customQueueIndex + 1}** / **${customQueue.length}**`,
        inline: true,
      });

      fields.push({
        name: '⏳ Remaining',
        value: `**${customQueue.length - customQueueIndex}** rolls`,
        inline: true,
      });
    }

    if (modeQueue.length > 0) {
      const remainingModes = modeQueue.slice(queueIndex);
      const queueDisplay = remainingModes
        .map((m, i) => {
          const prefix = i === 0 ? '▶️' : i < 3 ? '⏭️' : '⏩';
          const modeNamesLocal = { k: 'KECIL ≤31', b: 'BESAR ≥32', n: 'NORMAL' };
          return `${prefix} ${modeNamesLocal[m]}`;
        })
        .slice(0, 5)
        .join('\n');

      const moreText =
        remainingModes.length > 5 ? `\n... +${remainingModes.length - 5} more` : '';

      fields.push({
        name: '📋 Active Queue',
        value: queueDisplay + moreText,
        inline: false,
      });

      fields.push({
        name: '📊 Progress',
        value: `**${queueIndex + 1}** / **${modeQueue.length}**`,
        inline: true,
      });

      fields.push({
        name: '⏳ Remaining',
        value: `**${modeQueue.length - queueIndex}** rolls`,
        inline: true,
      });
    } else {
      fields.push({
        name: '📋 Queue Status',
        value: '`Empty`',
        inline: false,
      });
    }

    const embed = {
      color: colors[currentMode],
      title: '📊 Dice Controller Status',
      fields: fields,
      footer: BRAND_FOOTER,
      timestamp: new Date().toISOString(),
    };

    await message.reply({
      content: BRAND_TAG,
      embeds: [embed],
    });
    return;
  }

  // Command: !help
  if (content === '!help') {
    const embed = {
      color: 0x5865f2,
      title: '🎲 Dice Controller Commands',
      description: 'Control your dice rolls via Discord! ⚙️',
      fields: [
        {
          name: '🎯 Single Mode',
          value:
            '`!mode k` - KECIL (≤31)\n' +
            '`!mode b` - BESAR (≥32)\n' +
            '`!mode n` - NORMAL',
          inline: false,
        },
        {
          name: '🎯 Custom Target',
          value:
            '`!custom 38` - Set exact target (9-54)\n' +
            '`!setcustom 38-22-32` - Queue custom numbers',
          inline: false,
        },
        {
          name: '📋 Queue Mode',
          value:
            '`!set k-b-k` - Set queue (auto-switch per roll)\n' +
            '`!clear` - Clear queue & custom',
          inline: false,
        },
        {
          name: '📊 Information',
          value:
            '`!status` - Check current status\n' +
            '`!help` - Show this help',
          inline: false,
        },
        {
          name: '💡 Examples',
          value: '```!custom 42\n!setcustom 38-22-31\n!set k-k-b-n\n!mode k```',
          inline: false,
        },
      ],
      footer: BRAND_FOOTER,
      timestamp: new Date().toISOString(),
    };

    await message.reply({
      content: BRAND_TAG,
      embeds: [embed],
    });
  }
});

discord.login(DISCORD_TOKEN).catch((error) => {
  console.error('❌ Failed to login Discord bot:', error.message);
  console.error('Make sure DISCORD_TOKEN is set correctly!');
});

// ============================================
// GRACEFUL SHUTDOWN
// ============================================

process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, closing server...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});
