import * as Constants from './Constants';
import * as Utils from './Utils';

export async function scrape(url: string): Promise<Response | null> {
    try {
        return await fetch(url);
    } catch (e) {
        return null;
    }
}

export async function scrapeSteamProfilePicture(steamId: string): Promise<string | null> {
    const response = await scrape(`${Constants.STEAM_PROFILES_URL}${steamId}`);

    // Check if response is null (fetch failed) or status is not 200
    if (!response || response.status !== 200) {
        console.error(`Failed to scrape profile picture: ${Constants.STEAM_PROFILES_URL}${steamId}`);
        return null;
    }

    // In fetch, the body is a stream, so we must await the text conversion
    const dataString = await response.text();

    let png = dataString.match(/<img src="(.*_full.jpg)(.*?(?="))/);
    if (png) {
        return png[1];
    }

    return null;
}

export async function scrapeSteamProfileName(steamId: string): Promise<string | null> {
    const response = await scrape(`${Constants.STEAM_PROFILES_URL}${steamId}`);

    if (!response || response.status !== 200) {
        console.error(`Failed to scrape profile name: ${Constants.STEAM_PROFILES_URL}${steamId}`);
        return null;
    }

    const dataString = await response.text();

    // Note: Use 'g' flag with exec cautiously in loops, but fine here for single extraction
    let regex = new RegExp(`class="actual_persona_name">(.+?)</span>`, 'gm');
    let data = regex.exec(dataString);
    
    if (data) {
        return Utils.decodeHtml(data[1]);
    }

    return null;
}