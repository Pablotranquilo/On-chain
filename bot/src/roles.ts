import { Guild, GuildMember, Role } from "discord.js";

export async function findRole(guild: Guild, roleNameOrId: string): Promise<Role | null> {
  const cached = guild.roles.cache.find(
    (role) => role.id === roleNameOrId || role.name === roleNameOrId,
  );
  if (cached) {
    return cached;
  }

  await guild.roles.fetch();
  return guild.roles.cache.find(
    (role) => role.id === roleNameOrId || role.name === roleNameOrId,
  ) ?? null;
}

export async function assignRole(
  guild: Guild,
  member: GuildMember,
  roleNameOrId: string,
): Promise<Role> {
  const role = await findRole(guild, roleNameOrId);
  if (!role) {
    throw new Error(`Role not found: ${roleNameOrId}`);
  }

  await member.roles.add(role);
  return role;
}
