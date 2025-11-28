const { EmbedBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ActionRowBuilder, PermissionsBitField, Colors } = require("discord.js");

// (Variable to store the ghost role ID temporarily)
let GHOST_ROLE_ID = null; 

// (Function to load role settings from the database into cache)
async function loadRoleSettings(sql, antiRolesCache) {
    antiRolesCache.clear();
    // (Correction: better-sqlite3 is synchronous, doesn't strictly need await but keeping async for compatibility)
    const rows = sql.prepare("SELECT role_id, anti_roles, is_removable FROM role_settings").all();
    for (const row of rows) {
        const antiRolesList = row.anti_roles ? row.anti_roles.split(',').map(id => id.trim()).filter(id => id.length > 0) : [];
        antiRolesCache.set(row.role_id, {
            anti_roles: antiRolesList,
            is_removable: Boolean(row.is_removable)
        });
    }
    console.log(`[Reaction Roles] Loaded ${antiRolesCache.size} role settings into memory.`);
}

// (Function to update the ghost role)
function setGhostRole(roleId) {
    GHOST_ROLE_ID = roleId;
}

// (Main logic for handling interaction)
async function handleReactionRole(interaction, client, sql, antiRolesCache) {
    // (Using try-catch to prevent bot crashing on errors)
    try {
        await interaction.deferReply({ ephemeral: true });

        const guild = interaction.guild;
        const selectedValues = interaction.values;
        const member = interaction.member;
        const memberRoleIds = new Set(member.roles.cache.keys());

        // --- ( 🌟 Corrected Here 🌟 ) ---
        const menuMaster = sql.prepare("SELECT is_locked FROM role_menus_master WHERE message_id = ?")
                              .get(interaction.message.id);
        // -----------------------------

        if (!menuMaster) {
            return interaction.editReply({ content: 'Error: This menu is not registered in the database.' });
        }
        
        const isLocked = menuMaster.is_locked === 1;

        // --- ( 🌟 Corrected Here - This was the cause of the error 🌟 ) ---
        const allMenuRoleData = sql.prepare(`
            SELECT T1.role_id, T2.is_removable, T1.value
            FROM role_menu_items T1
            LEFT JOIN role_settings T2 ON T1.role_id = T2.role_id
            WHERE T1.message_id = ?
        `).all(interaction.message.id); // <-- The value is passed here
        // --------------------------------------------------
        
        let conflictDetected = false;
        
        // 1. Check for mandatory lock (Locked Menus)
        if (isLocked) {
            const currentMenuRoles = allMenuRoleData.filter(roleData => memberRoleIds.has(roleData.role_id));

            if (currentMenuRoles.length > 0) {
                // Attempting to remove or change
                if (selectedValues.length === 0 || currentMenuRoles.some(roleData => !selectedValues.includes(roleData.value)) || selectedValues.length > 1) { 
                    const refusalMessage = `✥ Action Denied <:0dalami:1395674712473862185>\n- Your race has already been set and cannot be changed.`;
                    return interaction.editReply({ content: refusalMessage });
                }
            } else if (selectedValues.length > 1) {
                // Attempting to select more than one role in the first interaction
                const refusalMessage = `✥ Action Denied <:0dalami:1395674712473862185>\n- You are only allowed to select one race.`;
                return interaction.editReply({ content: refusalMessage });
            }
        }
        
        // 2. Check for self-conflict and general rules
        const rolesToKeep = new Set();
        const rolesToAdd = [];
        let rolesToStrip = []; 
        
        if (!isLocked) { // Only for open menus
            for (const selectedValue of selectedValues) {
                const menuData = allMenuRoleData.find(d => d.value === selectedValue);
                if (!menuData) continue;
                
                const targetRoleId = menuData.role_id;
                const roleSettings = antiRolesCache.get(targetRoleId) || {};
                const antiRoleIds = roleSettings.anti_roles || [];
                
                // Conflict with another role selected in the same interaction
                const selfConflict = antiRoleIds.some(id => selectedValues.includes(allMenuRoleData.find(d => d.role_id === id)?.value));

                if (selfConflict) {
                    conflictDetected = true;
                    break;
                }
            }
        }

        if (conflictDetected) { 
            if (GHOST_ROLE_ID && guild.roles.cache.has(GHOST_ROLE_ID)) {
                if (!memberRoleIds.has(GHOST_ROLE_ID)) {
                    await member.roles.add(GHOST_ROLE_ID, 'Conflict in selecting anti-roles in the same interaction.');
                }
                const refusalMessage = `✥ You selected conflicting roles, so the action was denied and you were given the Ghost Role! Try selecting your roles again 👻`;
                return interaction.editReply({ content: refusalMessage });
            } else {
                const refusalMessage = `✥ Action Denied <:0dalami:1395674712473862185>\n- A conflict occurred between the selected roles in the same interaction.`;
                return interaction.editReply({ content: refusalMessage });
            }
        }

        // 2.2. Process Addition and Replacement/Removal
        for (const selectedValue of selectedValues) {
            const menuData = allMenuRoleData.find(d => d.value === selectedValue);
            if (!menuData) continue;

            const targetRoleId = menuData.role_id;
            const targetRole = guild.roles.cache.get(targetRoleId);
            if (!targetRole) continue;

            rolesToKeep.add(targetRoleId);

            if (!memberRoleIds.has(targetRoleId)) {
                rolesToAdd.push(targetRole);
            }

            const roleSettings = antiRolesCache.get(targetRoleId) || {};
            const antiRoleIds = roleSettings.anti_roles || [];

            for (const antiRoleId of antiRoleIds) {
                const antiRole = guild.roles.cache.get(antiRoleId);
                if (antiRole && memberRoleIds.has(antiRole.id) && !rolesToKeep.has(antiRole.id)) {
                    rolesToStrip.push(antiRole);
                }
            }
        }

        if (!isLocked) {
            for (const roleData of allMenuRoleData) {
                const roleId = roleData.role_id;
                const isRemovable = roleData.is_removable !== 0;

                if (isRemovable && memberRoleIds.has(roleId) && !rolesToKeep.has(roleId)) {
                    const roleToRemove = guild.roles.cache.get(roleId);
                    if(roleToRemove) {
                        rolesToStrip.push(roleToRemove);
                    }
                }
            }
        }
        
        const uniqueRolesToStrip = [...new Set(rolesToStrip)].filter(r => r && r.id !== GHOST_ROLE_ID); 
        const uniqueRolesToAdd = [...new Set(rolesToAdd)];

        try {
            if (uniqueRolesToStrip.length > 0) {
                await member.roles.remove(uniqueRolesToStrip, 'Anti-role system / Removing excess roles.');
            }
            if (uniqueRolesToAdd.length > 0) {
                await member.roles.add(uniqueRolesToAdd);
            }
        } catch (e) {
            console.error("RR Handler Error (Adding/Removing Roles):", e);
            return interaction.editReply({ content: "An error occurred while modifying your roles. My role might be lower than the required roles." });
        }

        // Build Summary Message
        let responseMsg = '';
        const animatedEmoji = '<a:6HypedDance:1401907058047189127>';
        const idleEmoji = '<:1Hmmmm:1414570720704467035>';

        if (uniqueRolesToAdd.length > 0 || uniqueRolesToStrip.length > 0) {
            responseMsg += `> Roles Updated ${animatedEmoji}\n\n`;

            if (uniqueRolesToAdd.length > 0) {
                const addedMentions = uniqueRolesToAdd.map(r => `${r}`).join(' ');
                responseMsg += `- Roles Added:\n${addedMentions}\n`;
            }

            if (uniqueRolesToStrip.length > 0) {
                const strippedMentions = uniqueRolesToStrip.map(r => `${r}`).join(' ');
                responseMsg += `- Roles Removed:\n${strippedMentions}\n`;
            }
        } else {
            responseMsg = `❖ Updated. No roles were added or removed ${idleEmoji}`;
        }

        return interaction.editReply({ content: responseMsg });
    } catch (error) {
        console.error("[Reaction Role Handler] Fatal Error:", error);
        if (!interaction.replied && !interaction.deferred) {
             return interaction.reply({ content: "An internal error occurred while processing roles.", ephemeral: true });
        } else {
             return interaction.editReply({ content: "An internal error occurred while processing roles." });
        }
    }
}

module.exports = {
    handleReactionRole,
    loadRoleSettings,
    setGhostRole
};
