const { EmbedBuilder, PermissionsBitField } = require("discord.js");
const SQLite = require("better-sqlite3");
const sql = new SQLite('./mainDB.sqlite');

module.exports = {
    name: 'role-level',
    aliases: ['rlevel', 'level-roles'],
    description: "Rewards role when user leveled up to a certain level",
    category: "Leveling",
    cooldown: 3,
    async execute (message, args) {
        if(!message.guild.members.me.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
            return message.reply(`I do not have permission to manage roles!`);
        }
        if(!message.member.permissions.has(PermissionsBitField.Flags.ManageRoles) || !message.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            return message.reply(`You do not have permission to use this command!`);
        }

        const prefix = "-";

        if(!args.length) {
            let embed = new EmbedBuilder()
                .setTitle(`Leveling Roles Setup`)
                .setDescription(`Rewards role when user leveled up to a certain level`)
                .addFields({ name: `${prefix}role-level add <level> <@role>`, value: `Sets a role to be given to user when they leveled up to certain level.`})
                .addFields({ name: `${prefix}role-level remove <level>`, value: `Removes the role set at the specified level.`})
                .addFields({ name: `${prefix}role-level show`, value: `Shows all roles set to levels.`})
                .setColor("Random");

            return message.channel.send({ embeds: [embed] });
        }

        const method = args[0].toLowerCase();
        const levelArgs = parseInt(args[1]);
        const roleArg = args.slice(2).join(' ');

        const role = message.mentions.roles.first() || message.guild.roles.cache.get(roleArg) || message.guild.roles.cache.find(r => (r.name === roleArg.toString()));

        const getRole = sql.prepare("SELECT * FROM roles WHERE guildID = ? AND roleID = ? AND level = ?");
        const setRole = sql.prepare("INSERT OR REPLACE INTO roles (guildID, roleID, level) VALUES (@guildID, @roleID, @level);");

        if(method === 'add') {
            if(isNaN(levelArgs) || !levelArgs || levelArgs < 1) {
                return message.reply(`Please provide a level to set.`);
            } else {
                if(!role) {
                    return message.reply(`You did not provide a role to set!`);
                } else {
                    let Role = getRole.get(message.guild.id, role.id, levelArgs);
                    if(!Role) {
                        Role = {
                            guildID: message.guild.id,
                            roleID: role.id,
                            level: levelArgs
                        }
                        setRole.run(Role);
                        let embed = new EmbedBuilder()
                            .setTitle(`Successfully set role!`)
                            .setDescription(`${role} has been set for level ${levelArgs}`)
                            .setColor("Random");
                        return message.channel.send({ embeds: [embed] });
                    } else {
                        sql.prepare(`DELETE FROM roles WHERE guildID = ? AND roleID = ? AND level = ?`).run(message.guild.id, role.id, levelArgs);
                        sql.prepare(`INSERT INTO roles(guildID, roleID, level) VALUES(?,?,?)`).run(message.guild.id, role.id, levelArgs);

                        let embed = new EmbedBuilder()
                            .setTitle(`Successfully set role!`)
                            .setDescription(`${role} has been updated for level ${levelArgs}`)
                            .setColor("Random");
                        return message.channel.send({ embeds: [embed] });
                    }
                }
            }
        }

        if(method === 'show') {
            const allRoles = sql.prepare(`SELECT * FROM roles WHERE guildID = ? ORDER BY level ASC`).all(message.guild.id);
            if(!allRoles || allRoles.length === 0) {
                return message.reply(`There are no roles set!`);
            } else {
                let embed = new EmbedBuilder()
                    .setTitle(`${message.guild.name} Roles Level`)
                    .setDescription(`\`${prefix}help role-level\` for more information`)
                    .setColor("Random");

                let description = "";
                for(const data of allRoles) {
                    let LevelSet = data.level;
                    let RolesSet = data.roleID;
                    description += `**Level ${LevelSet}**: <@&${RolesSet}>\n`;
                }
                embed.setDescription(description);
                return message.channel.send({ embeds: [embed] });
            }
        }

        const getLevel = sql.prepare(`SELECT * FROM roles WHERE guildID = ? AND level = ?`);
        const levels = getLevel.get(message.guild.id, levelArgs);

        if(method === 'remove' || method === 'delete') {
            if(isNaN(levelArgs) || !levelArgs || levelArgs < 1) {
                return message.reply(`Please provide a level to remove.`);
            } else {
                if(!levels) {
                    return message.reply(`That isn't a valid level!`);
                } else {
                    sql.prepare(`DELETE FROM roles WHERE guildID = ? AND level = ?`).run(message.guild.id, levelArgs);
                    let embed = new EmbedBuilder()
                        .setTitle(`Successfully set role!`)
                        .setDescription(`Role rewards for level ${levelArgs} has been removed.`)
                        .setColor("Random");
                    return message.channel.send({ embeds: [embed] });
                }
            }
        }
    }
}