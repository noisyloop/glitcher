'use strict';

/*
 * config.js — loads config/effects.json (the single source of truth for what
 * effects exist) and exposes it to ui.js and pipeline.js.
 *
 * Uses a top-level await so importers receive the fully-parsed config; the file
 * is served same-origin so the CSP `connect-src 'self'` permits the fetch.
 */

const url = new URL('../config/effects.json', import.meta.url);
const res = await fetch(url);
if (!res.ok) throw new Error(`failed to load effects config: ${res.status}`);

/** @type {Array<{id:string,label:string,group:string,min?:number,max?:number,step?:number,default:number,neutral:number,type?:string,param?:boolean}>} */
export const EFFECTS_CONFIG = await res.json();

// Convenience lookup: id -> config entry.
export const CONFIG_BY_ID = Object.fromEntries(EFFECTS_CONFIG.map((c) => [c.id, c]));

// Default/neutral value maps.
export const DEFAULTS = Object.fromEntries(EFFECTS_CONFIG.map((c) => [c.id, c.default]));
