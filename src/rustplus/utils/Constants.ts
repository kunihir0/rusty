export const DEFAULT_SERVER_URL = 'https://rust.facepunch.com';
export const DEFAULT_SERVER_IMG = 'https://files.facepunch.com/lewis/1b2411b1/og-image.jpg';
export const STEAM_PROFILES_URL = 'https://steamcommunity.com/profiles/';
export const BATTLEMETRICS_PROFILE_URL = 'https://www.battlemetrics.com/players/';
export const BATTLEMETRICS_SERVER_URL = 'https://www.battlemetrics.com/servers/rust/';
export const AFK_TIME_SECONDS = 5 * 60; /* 5 min */
export const MAX_LENGTH_TEAM_MESSAGE = 128;
export const STEAMID64_LENGTH = 17;
export const STEAM_PROFILE_NAME_MAX_LENGTH = 32;
export const BOT_MESSAGE_HISTORY_LIMIT = 16;
export const BOT_LEAVE_VOICE_CHAT_TIMEOUT_MS = 10000;

/* Embeds */
export const EMBED_MAX_TOTAL_CHARACTERS = 6000;
export const EMBED_MAX_TITLE_CHARACTERS = 256;
export const EMBED_MAX_DESCRIPTION_CHARACTERS = 4096;
export const EMBED_MAX_FIELDS = 25;
export const EMBED_MAX_FIELD_NAME_CHARACTERS = 256;
export const EMBED_MAX_FIELD_VALUE_CHARACTERS = 1024;
export const EMBED_MAX_FOOTER_CHARACTERS = 2048;
export const EMBED_MAX_AUTHOR_NAME_CHARACTERS = 256;
export const EMBED_MAX_EMBEDS_IN_MESSAGE = 10;

/* Select menus */
export const SELECT_MENU_MAX_DESCRIPTION_CHARACTERS = 100;

export const EMBED_FIELD_MAX_WIDTH_LENGTH_1 = 54;
export const EMBED_FIELD_MAX_WIDTH_LENGTH_2 = 26;
export const EMBED_FIELD_MAX_WIDTH_LENGTH_3 = 20;

export const STORAGE_MONITOR_TOOL_CUPBOARD_CAPACITY = 29;
export const STORAGE_MONITOR_VENDING_MACHINE_CAPACITY = 30;
export const STORAGE_MONITOR_LARGE_WOOD_BOX_CAPACITY = 48;

/* Default timer times */
export const DEFAULT_CARGO_SHIP_EGRESS_TIME_MS = 50 * 60 * 1000; /* 50 min */
export const DEFAULT_OIL_RIG_LOCKED_CRATE_UNLOCK_TIME_MS = 15 * 60 * 1000; /* 15 min */

/* Other constants */
export const PATROL_HELI_DOWNED_RADIUS = 400;
export const OIL_RIG_CHINOOK_47_MAX_SPAWN_DISTANCE = 550;
export const PROXIMITY_SETTING_DEFAULT_METERS = 500;
export const HARBOR_DOCK_DISTANCE = 100;

/* Emojis */
export const ONLINE_EMOJI = ':green_circle:';
export const OFFLINE_EMOJI = ':red_circle:';
export const NOT_FOUND_EMOJI = ':x:';
export const AFK_EMOJI = ':yellow_circle:';
export const ALIVE_EMOJI = ':nerd:';
export const SLEEPING_EMOJI = ':sleeping:';
export const DEAD_EMOJI = ':skull:';
export const LEADER_EMOJI = ':crown:';
export const DAY_EMOJI = ':sunny:';
export const NIGHT_EMOJI = ':crescent_moon:';
export const PAIRED_EMOJI = ':parking:';

/* Colors */
export const COLOR_ACTIVE = '#00FF40';
export const COLOR_CARGO_SHIP_ENTERS_EGRESS_STAGE = '#4B0082';
export const COLOR_CARGO_SHIP_ENTERS_MAP = '#9932CC';
export const COLOR_CARGO_SHIP_DOCKED = '#4444C7';
export const COLOR_CARGO_SHIP_LEFT_MAP = '#8B008B';
export const COLOR_CARGO_SHIP_LOCATED = '#191970';
export const COLOR_CARGO_TRACER = '#FF0000';
export const COLOR_CHINOOK47_ENTERS_MAP = '#1E90FF';
export const COLOR_CHINOOK47_LOCATED = '#00FF00';
export const COLOR_DEFAULT = '#CE412B';
export const COLOR_GREY = '#606060';
export const COLOR_HEAVY_SCIENTISTS_CALLED_LARGE = '#DDA0DD';
export const COLOR_HEAVY_SCIENTISTS_CALLED_SMALL = '#FFC0CB';
export const COLOR_INACTIVE = '#FF0040';
export const COLOR_LOCKED_CRATE_LARGE_OILRIG_UNLOCKED = '#FF69B4';
export const COLOR_LOCKED_CRATE_SMALL_OILRIG_UNLOCKED = '#00FA9A';
export const COLOR_NEW_VENDING_MACHINE = '#F08080';
export const COLOR_PATROL_HELICOPTER_ENTERS_MAP = '#DC143C';
export const COLOR_PATROL_HELICOPTER_LEFT_MAP = '#FFD700';
export const COLOR_PATROL_HELICOPTER_LOCATED_AT = '#4169E1';
export const COLOR_PATROL_HELICOPTER_TAKEN_DOWN = '#FFBF00';
export const COLOR_PATROL_HELICOPTER_TRACER = '#00FF00';
export const COLOR_SETTINGS = '#861C0C';
export const COLOR_TEAMCHAT_DEFAULT = '#CE412B';
export const COLOR_TRAVELING_VENDOR_HALTED = '#98C4D8';
export const COLOR_TRAVELING_VENDOR_LOCATED_AT = '#F4A3E2';
export const COLOR_TRAVELING_VENDOR_LEFT_MAP = '#5A3E9A';
export const COLOR_TRAVELING_VENDOR_MOVING = '#7FCE41';

export function GET_STEAM_PROFILE_LINK(steamId: string): string {
    return `[${steamId}](${STEAM_PROFILES_URL}${steamId})`;
}

export function GET_BATTLEMETRICS_PROFILE_LINK(playerId: string | number): string {
    return `[${playerId}](${BATTLEMETRICS_PROFILE_URL}${playerId})`;
}
