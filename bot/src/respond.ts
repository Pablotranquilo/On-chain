import { EmbedBuilder } from "discord.js";
import { VerificationResult } from "./queue";

export function buildResultEmbed(result: VerificationResult) {
  return new EmbedBuilder()
    .setTitle("Verification Result")
    .addFields(
      { name: "Project", value: result.projectId, inline: true },
      { name: "Score", value: result.score.toString(), inline: true },
      { name: "Confidence", value: `${result.confidence}%`, inline: true },
      { name: "Role assigned", value: result.role, inline: true },
      { name: "X link", value: result.xUrl },
    )
    .setColor(0x2f3136)
    .setTimestamp(new Date());
}

export const submissionExample =
  "@myhandle https://x.com/myhandle/status/123456789012345678";
