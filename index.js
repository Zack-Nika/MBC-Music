// index.js
require('dotenv').config();  // Load .env file (for local dev). In Railway, use env vars.

const { Client, IntentsBitField } = require('discord.js');
const { Manager } = require('erela.js');
// Use spotify-url-info to handle Spotify URLs (fetch track/playlist info)&#8203;:contentReference[oaicite:2]{index=2}
const fetch = require('isomorphic-unfetch');
const { getData } = require('spotify-url-info')(fetch);

// Discord client with necessary intents (Guilds, Messages, Voice states, and Message content)
const client = new Client({ 
  intents: [
    IntentsBitField.Flags.Guilds, 
    IntentsBitField.Flags.GuildVoiceStates,
    IntentsBitField.Flags.GuildMessages, 
    IntentsBitField.Flags.MessageContent 
  ] 
});

const prefix = '+';

// Set up Erela.js Lavalink Manager with one node (from .env configuration)
client.manager = new Manager({
  nodes: [
    {
      host: process.env.LAVALINK_HOST,
      port: Number(process.env.LAVALINK_PORT || 2333),
      password: process.env.LAVALINK_PASSWORD,
      secure: process.env.LAVALINK_SECURE === 'true'   // Use TLS if true
    }
  ],
  // Auto-play next track when current ends (queue handling)&#8203;:contentReference[oaicite:3]{index=3}
  autoPlay: true,
  // Function to send voice data to Discord — integrates Discord.js with Lavalink&#8203;:contentReference[oaicite:4]{index=4}
  send(id, payload) {
    const guild = client.guilds.cache.get(id);
    if (guild) guild.shard.send(payload);
  }
});

// Lavalink node event handlers for reliability
client.manager.on('nodeConnect', node => {
  console.log(`✅ Connected to Lavalink node: ${node.options.host}`);
});
client.manager.on('nodeError', (node, error) => {
  console.error(`🛑 Lavalink node error: ${error.message}`);
});
client.manager.on('nodeDisconnect', node => {
  console.warn('⚠️ Lavalink node disconnected! Attempting reconnect in 5s...');
  setTimeout(() => {
    if (!node.connected) node.connect();  // try to reconnect
  }, 5000);
});

// Music player event handlers
client.manager.on('trackStart', (player, track) => {
  // Announce the currently playing track in the text channel&#8203;:contentReference[oaicite:5]{index=5}
  const textChannel = client.channels.cache.get(player.textChannel);
  if (textChannel) {
    textChannel.send(`🎵 **دابا كتسمع:** ${track.title}`);
  }
});
client.manager.on('queueEnd', player => {
  // Queue finished - leave voice channel
  const textChannel = client.channels.cache.get(player.textChannel);
  if (textChannel) {
    textChannel.send("✅ سالينا القائمة، البوت غادي يخرج من الروم دابا.");
  }
  player.destroy();  // Disconnect from voice
});
client.manager.on('trackError', (player, track, payload) => {
  // Handle track play errors to avoid crashes
  console.error(`Track error for ${track.title}: ${payload.error}`);
  const textChannel = client.channels.cache.get(player.textChannel);
  if (textChannel) {
    textChannel.send(`⚠️ ما قدرش البوت يشغل **${track.title}** بسبب خطأ. كنزوّدو للأغنية الموالية.`);
  }
  player.stop();  // Skip this track
});
client.manager.on('trackStuck', (player, track, payload) => {
  // Handle stuck tracks (e.g. network issues)
  console.error(`Track stuck for ${track.title}: ${payload.thresholdMs}ms`);
  const textChannel = client.channels.cache.get(player.textChannel);
  if (textChannel) {
    textChannel.send(`⚠️ تعطل التشغيل ف **${track.title}** بزّاف. كنمرّو للأغنية اللي موراها...`);
  }
  player.stop();
});

// When the Discord client is ready, initialize the Lavalink manager&#8203;:contentReference[oaicite:6]{index=6}
client.once('ready', () => {
  console.log(`🤖 Logged in as ${client.user.tag}!`);
  client.manager.init(client.user.id);
});

// Forward Discord voice events to Lavalink (required for voice connection)&#8203;:contentReference[oaicite:7]{index=7}
client.on('raw', data => {
  client.manager.updateVoiceState(data);
});

// Command handling
client.on('messageCreate', async message => {
  if (!message.guild || message.author.bot) return;  // Ignore bots and DMs
  if (!message.content.startsWith(prefix)) return;

  const args = message.content.slice(prefix.length).trim().split(/\s+/);
  const command = args.shift()?.toLowerCase();

  // Ping command - checks bot latency
  if (command === 'ping') {
    const sent = await message.reply('🏓 جارٍ حساب وقت الاستجابة...');
    const latency = sent.createdTimestamp - message.createdTimestamp;
    sent.edit(`🏓 **Pong!** السرعة: ${latency}ms`);
  }

  // Join command - bot joins the user's voice channel
  else if (command === 'join') {
    if (!message.member.voice.channel) {
      return message.reply("🔊 خاصك تكون فشي روم صوتي باش تستعمل هاد الأمر!");
    }
    const voiceChannel = message.member.voice.channel;
    // Create or move player to the voice channel
    let player = client.manager.players.get(message.guild.id);
    if (player) {
      // If already connected, move if needed
      if (player.voiceChannel === voiceChannel.id) {
        return message.reply("🎧 البوت ديجا معاك فهاد الروم الصوتي.");
      }
      player.setVoiceChannel(voiceChannel.id);
      player.connect();
      return message.reply("🔄 البوت بدّل الروم الصوتي ديالو دابا.");
    } else {
      // Not connected yet, create a new player
      player = client.manager.create({
        guild: message.guild.id,
        voiceChannel: voiceChannel.id,
        textChannel: message.channel.id,
        selfDeaf: true
      });
      player.connect();
      return message.reply("✅ دخلت للروم الصوتي ديالك!");
    }
  }

  // Play command - play a song or playlist from YouTube/Spotify
  else if (command === 'play') {
    if (!message.member.voice.channel) {
      return message.reply("🔊 خاصك تكون فشي روم صوتي باش تشغل الموسيقى!");
    }
    const query = args.join(' ');
    if (!query) {
      return message.reply("ℹ️ استعمل `+play [اسم الأغنية أو رابط يوتيوب/سبوتيفاي]` من فضلك.");
    }

    // Get or create player for this guild
    let player = client.manager.players.get(message.guild.id);
    if (!player) {
      player = client.manager.create({
        guild: message.guild.id,
        voiceChannel: message.member.voice.channel.id,
        textChannel: message.channel.id,
        selfDeaf: true
      });
      player.connect();
    } else if (player.voiceChannel !== message.member.voice.channel.id) {
      return message.reply("⚠️ خاصك تكون نفس الروم الصوتي للي فيها البوت باش تشغل الموسيقى.");
    }

    try {
      // Handle Spotify URL (playlist/track)
      if (query.includes('open.spotify.com/')) {
        const spotifyData = await getData(query);  // Fetch Spotify info (may be track or playlist)&#8203;:contentReference[oaicite:8]{index=8}
        if (spotifyData.type === 'track') {
          // Single Spotify track -> search YouTube for song title + artist
          const trackName = spotifyData.name || spotifyData.title;
          const artistName = spotifyData.artists ? spotifyData.artists[0].name : '';
          const searchTerm = `${trackName} ${artistName}`.trim();
          const res = await client.manager.search(searchTerm, message.author);
          if (!res.tracks.length) {
            return message.reply("❌ ما لقيتش هاد الأغنية ف يوتيوب.");
          }
          const track = res.tracks[0];
          player.queue.add(track);
          message.reply(`✔️ ضفت **${track.title}** للقائمة ديال الموسيقى!`);
        } else if (spotifyData.type === 'playlist' || spotifyData.type === 'album') {
          // Spotify playlist/album -> get tracks and add each to queue
          const tracks = spotifyData.tracks?.items || [];
          if (!tracks.length) {
            return message.reply("❌ ما لقيتش الأغاني ف هاد الـSpotify الرابط.");
          }
          for (const item of tracks) {
            // Each item in playlist has a 'track' object, in album it's directly the track
            const trackInfo = spotifyData.type === 'playlist' ? item.track : item;
            const name = trackInfo.name;
            const artist = trackInfo.artists?.[0]?.name || '';
            if (!name) continue;
            const searchTerm = `${name} ${artist}`.trim();
            const res = await client.manager.search(searchTerm, message.author);
            if (res.tracks.length) {
              player.queue.add(res.tracks[0]);
            }
          }
          message.reply(`✔️ ضفت **${player.queue.length}** ديال الأغاني من سبوتيفاي للقائمة!`);
        } else {
          return message.reply("⚠️ ما يمكنش نشغل هاد النوع ديال روابط Spotify مباشرة.");
        }
      } 
      // Handle YouTube or search query
      else {
        const res = await client.manager.search(query, message.author);
        if (res.loadType === 'LOAD_FAILED' || !res.tracks.length) {
          return message.reply("❌ ما قدرش البوت يلقی الأغنية المطلوبة.");
        }
        if (res.loadType === 'PLAYLIST_LOADED') {
          // If a YouTube playlist URL was provided, add all tracks
          for (const track of res.tracks) {
            player.queue.add(track);
          }
          message.reply(`✔️ ضفت **${res.tracks.length}** ديال الأغاني للقائمة ديال الموسيقى!`);
        } else {
          // Single track (link or search result)
          const track = res.tracks[0];
          player.queue.add(track);
          message.reply(`✔️ ضفت **${track.title}** للقائمة ديال الموسيقى!`);
        }
      }

      // If nothing is currently playing, start playing the queue&#8203;:contentReference[oaicite:9]{index=9}
      if (!player.playing && !player.paused && player.queue.size) {
        player.play();
      }
    } catch (err) {
      console.error(err);
      message.reply("🛑 وقع مشكل فمحاولة تشغيل هاد الموسيقى.");
    }
  }

  // Skip command - skip the current track
  else if (command === 'skip') {
    const player = client.manager.players.get(message.guild.id);
    if (!player || !player.queue.current) {
      return message.reply("⚠️ ما كايناش شي أغنية مشغلة باش نخطّيوها.");
    }
    player.stop();  // Stops the current track, triggering next track to play
    message.reply("⏭️ تخطّيت للأغنية اللّي موراها.");
  }

  // Stop command - stop music and leave voice
  else if (command === 'stop') {
    const player = client.manager.players.get(message.guild.id);
    if (!player) {
      return message.reply("⚠️ ما كايناش موسيقى مشغلة باش نوقفها.");
    }
    player.destroy();  // Disconnects from voice and clears the queue
    message.reply("🛑 وقفت الموسيقى وخرجت من الروم الصوتي.");
  }

  // Cmd (help) command - list all commands
  else if (command === 'cmd' || command === 'help') {
    const helpText = "**الأوامر المتوفرة:**\n"
      + "```"
      + "+join - يدخل البوت للروم الصوتي ديالك\n"
      + "+play <اسم الأغنية / الرابط> - تشغيل أغنية من يوتيوب ولا سبوتيفاي\n"
      + "+skip - تخطّي الأغنية الحالية\n"
      + "+stop - توقيف الموسيقى وخروج البوت من الروم\n"
      + "+ping - عرض سرعة الاستجابة ديال البوت\n"
      + "+cmd (أو +help) - عرض هاد رسالة المساعدة"
      + "```";
    message.reply(helpText);
  }
});

// Log in to Discord with your bot token
client.login(process.env.DISCORD_TOKEN);
