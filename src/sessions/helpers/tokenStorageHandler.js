/*
 * File: tokenStorageHandler.js
 * Project: steam-idler
 * Created Date: 2022-10-10 12:53:20
 * Author: 3urobeat
 *
 * Last Modified: 2024-10-19 14:25:03
 * Modified By: 3urobeat
 *
 * Copyright (c) 2022 - 2024 3urobeat <https://github.com/3urobeat>
 *
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
 */


const sessionHandler = require("../sessionHandler.js");


// Helper function which decodes a JsonWebToken - https://stackoverflow.com/a/38552302
sessionHandler.prototype._decodeJWT = function(token) {
    const payload = token.split(".")[1];           // Remove header and signature as we only care about the payload
    const decoded = Buffer.from(payload, "base64"); // Decode

    // Try to parse json object
    try {
        const parsed = JSON.parse(decoded.toString());
        return parsed;
    } catch (err) {
        logger("err", `Failed to parse JWT from tokens.db! Please report this issue if it keeps occurring! Getting a new session...\nError: ${err}`, true);
        return null;
    } // No need to invalidate token here as the new session will get a new token and overwrite the existing one anyway
};


/**
 * Internal - Attempts to get a token for this account from tokens.db and checks if it's valid
 * @param {Function} [callback] Called with `refreshToken` (String) on success or `null` on failure
 */
sessionHandler.prototype._getTokenFromStorage = function(callback) {

    // Search tokens database with accountName for a valid token so we can skip creating a new session
    this.tokensdb.findOne({ accountName: this.logOnOptions.accountName }, (err, doc) => {
        if (err) {
            logger("warn", `Database error! Failed to check for existing token for accountName '${this.logOnOptions.accountName}', returning null to get a new session. Please report this issue if it keeps occurring!\nError: ${err}`, true);
            return callback(null);
        }

        // If we still have a token stored then check if it is still valid
        if (doc) {
            // Decode the token we've found
            const jwtObj = this._decodeJWT(doc.token);
            if (!jwtObj) return callback(null); // Get new session if _decodeJWT() failed

            // Define valid until str to use it in log msg
            const validUntilStr = `${(new Date(jwtObj.exp * 1000)).toISOString().replace(/T/, " ").replace(/\..+/, "")} (GMT time)`;

            // Compare expire value (unix timestamp in seconds) to current date
            if (jwtObj.exp * 1000 > Date.now()) {
                logger("info", `[${this.thisbot}] Found valid token until '${validUntilStr}' in tokens.db! Logging in with it to reuse session...`, false, true);
                callback(doc.token);
            } else {
                logger("info", `[${this.thisbot}] Found invalid token in tokens.db. It was valid till '${validUntilStr}'. Logging in with credentials to get a new session...`, false, true);
                callback(null);
            }
        } else {
            logger("info", `[${this.thisbot}] No token found in tokens.db. Logging in with credentials to get a new session...`, false, true);
            callback(null);
        }
    });
};


/**
 * Internal - Saves a new token for this account to tokens.db
 * @param {string} token The refreshToken to store
 */
sessionHandler.prototype._saveTokenToStorage = function(token) {
    logger("debug", `_saveTokenToStorage(): Updating tokens.db entry for accountName '${this.logOnOptions.accountName}'...`);

    // Update db entry for this account. Upsert is enabled so a new doc will be inserted if none exists yet
    this.tokensdb.updateAsync({ accountName: this.logOnOptions.accountName }, { $set: { token: token } }, { upsert: true });
};


/**
 * Remove the token of this account from tokens.db. Intended to be called from the steam-user login error event when an invalid token was used so the next login attempt will create a new one.
 */
sessionHandler.prototype.invalidateTokenInStorage = function() {
    logger("debug", `[${this.thisbot}] invalidateTokenInStorage(): Removing refreshToken for accountName '${this.logOnOptions.accountName}' from tokens.db...`);

    this.tokensdb.removeAsync({ accountName: this.logOnOptions.accountName }, { multi: true });
};
