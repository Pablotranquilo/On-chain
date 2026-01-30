import {
  ChannelType,
  Client,
  GatewayIntentBits,
  TextChannel,
} from "discord.js";
import { config } from "./config";
import { parseSubmission } from "./parseSubmission";
import { validateSubmission } from "./validateX";
import { buildResultEmbed, submissionExample } from "./respond";
import { assignRole } from "./roles";
import { createQueue } from "./queue";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

const queue = createQueue(config.redisUrl);

client.once("ready", () => {
  console.log(`Logged in as ${client.user?.tag ?? "unknown"}`);
});

client.on("messageCreate", async (message) => {
  if (message.author.bot || !message.guild) {
    return;
  }

  if (message.channel.type !== ChannelType.GuildText) {
    return;
  }

  if (message.channel.name !== config.verifyChannel) {
    return;
  }

  const imageAttachments = message.attachments.filter((attachment) => {
    if (attachment.contentType?.startsWith("image/")) {
      return true;
    }
    const name = attachment.name?.toLowerCase() ?? "";
    return [".png", ".jpg", ".jpeg", ".gif", ".webp"].some((ext) =>
      name.endsWith(ext),
    );
  });

  if (imageAttachments.size !== 1) {
    await message.reply(
      "Please include exactly 1 image attachment with your submission.",
    );
    return;
  }

  const parsed = parseSubmission(message.content);
  const validation = validateSubmission(parsed);

  if (!validation.ok) {
    await message.reply(
      `${validation.reason} Example format: ${submissionExample}`,
    );
    return;
  }

  await message.reply("Processing your submission…");

  await queue.enqueueJob({
    messageId: message.id,
    channelId: message.channel.id,
    guildId: message.guild.id,
    userId: message.author.id,
    xUrl: parsed.xUrl ?? "",
    claimedUsername: parsed.claimedUsername ?? "",
  });
});

async function handleResult(result: {
  guildId: string;
  channelId: string;
  userId: string;
  role: string;
  projectId: string;
  score: number;
  confidence: number;
  xUrl: string;
}) {
  const guild = await client.guilds.fetch(result.guildId).catch(() => null);
  if (!guild) {
    return;
  }

  const channel = await guild.channels
    .fetch(result.channelId)
    .catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildText) {
    return;
  }

  const member = await guild.members.fetch(result.userId).catch(() => null);
  if (!member) {
    return;
  }

  const assignedRole = await assignRole(guild, member, result.role);
  const embed = buildResultEmbed({
    ...result,
    role: assignedRole.name,
  });

  await (channel as TextChannel).send({
    content: `<@${result.userId}> verification complete!`,
    embeds: [embed],
  });
}

async function start() {
  queue.startResultListener(handleResult).catch((error) => {
    console.error("Result listener failed", error);
  });

  if (config.stubWorker) {
    queue.startStubWorker().catch((error) => {
      console.error("Stub worker failed", error);
    });
  }

  await client.login(config.discordToken);
}

start().catch((error) => {
  console.error("Failed to start bot", error);
  process.exit(1);
});
