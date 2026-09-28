// Leest de collecties clubs, coaches en seizoenen via de Firestore REST API en schrijft
// data/snapshot.json voor de publieke pagina's (index.html, explore.html en het archief v0.9/).
// Gebruik: node .github/scripts/firestore-snapshot.mjs [uitvoerbestand]
// Kost één document-read per document (nu ruim 3.000). Schrijft alleen als de data veranderd is
// en meldt dat via GITHUB_OUTPUT (changed=true/false).

import fs from "node:fs";
import { mergeSeasonImport } from "../../data/bronnen/merge_seizoensimport.mjs";

const PROJECT = process.env.FIRESTORE_PROJECT || "voetbaltrainers";
// Web-API-sleutel van het project; staat ook openbaar in index.html.
const API_KEY = process.env.FIRESTORE_API_KEY ?? "AIzaSyDZckphHLQiTK2KZHPOyPDxgB6glBr4HpY";
const BASE = process.env.FIRESTORE_BASE || `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const OUT = process.argv[2] || "data/snapshot.json";
const COLLECTIONS = ["clubs", "coaches", "seizoenen"];

// Firestore REST-waarden ({stringValue: "x"}, {integerValue: "3"}, ...) naar gewone JSON.
function decode(v) {
    if ("stringValue" in v) return v.stringValue;
    if ("integerValue" in v) return Number(v.integerValue);
    if ("doubleValue" in v) return Number(v.doubleValue);
    if ("booleanValue" in v) return v.booleanValue;
    if ("nullValue" in v) return null;
    if ("timestampValue" in v) return new Date(v.timestampValue).toISOString();
    if ("arrayValue" in v) return (v.arrayValue.values || []).map(decode);
    if ("mapValue" in v) return decodeFields(v.mapValue.fields || {});
    if ("referenceValue" in v) return v.referenceValue.split("/documents/")[1] ?? v.referenceValue;
    if ("geoPointValue" in v) return { latitude: v.geoPointValue.latitude ?? 0, longitude: v.geoPointValue.longitude ?? 0 };
    if ("bytesValue" in v) return v.bytesValue;
    throw new Error(`Onbekend Firestore-type: ${Object.keys(v).join(", ")}`);
}

// Sleutels gesorteerd, zodat de snapshot bij gelijke data byte-voor-byte gelijk blijft.
function decodeFields(fields) {
    return Object.fromEntries(Object.keys(fields).sort().map(k => [k, decode(fields[k])]));
}

async function getJson(url) {
    for (let attempt = 1; ; attempt++) {
        const res = await fetch(url);
        if (res.ok) return res.json();
        const body = await res.text();
        if (res.status === 429) throw new Error(`Firestore-quotum op (429). Na de dagelijkse reset (rond middernacht Pacific-tijd) opnieuw proberen.\n${body}`);
        if (res.status < 500 || attempt === 3) throw new Error(`HTTP ${res.status} bij ${url.replace(/key=[^&]+/, "key=…")}\n${body}`);
        await new Promise(r => setTimeout(r, 2000 * attempt));
    }
}

async function readCollection(name) {
    const docs = [];
    let pageToken = "";
    do {
        const params = new URLSearchParams({ pageSize: "300" });
        if (pageToken) params.set("pageToken", pageToken);
        if (API_KEY) params.set("key", API_KEY);
        const page = await getJson(`${BASE}/${name}?${params}`);
        for (const d of page.documents || []) docs.push({ id: d.name.split("/").pop(), ...decodeFields(d.fields || {}) });
        pageToken = page.nextPageToken || "";
    } while (pageToken);
    return docs.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

// Eén document per regel, zodat GitHub de wijzigingen per document toont.
function format(generated, collections) {
    const parts = [`"generated": ${JSON.stringify(generated)}`];
    for (const [name, docs] of Object.entries(collections)) {
        parts.push(`"${name}": [\n${docs.map(d => JSON.stringify(d)).join(",\n")}\n]`);
    }
    return `{\n${parts.join(",\n")}\n}\n`;
}

function setOutput(key, value) {
    if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
}

const collections = {};
for (const name of COLLECTIONS) {
    collections[name] = await readCollection(name);
    console.log(`${name}: ${collections[name].length} documenten`);
}

// Tijdelijke, versiebeheerbare aanvulling voor nieuwe seizoenen. Zodra een clubseizoen
// in Firestore staat, blijft het Firestore-document leidend en worden alleen ontbrekende
// trainersvelden uit het importbestand aangevuld.
const seasonImportPath = "data/import_2025-26.json";
if (fs.existsSync(seasonImportPath)) {
    const rows = JSON.parse(fs.readFileSync(seasonImportPath, "utf8"));
    mergeSeasonImport(collections, rows);
    console.log(`seizoensaanvulling: ${rows.length} rijen verwerkt`);
}

let previous = null;
try { previous = JSON.parse(fs.readFileSync(OUT, "utf8")); } catch { /* nog geen snapshot */ }

// Vangnet: een lege of sterk gekrompen collectie wijst eerder op een fout dan op echte data.
for (const name of COLLECTIONS) {
    const now = collections[name].length, before = previous?.[name]?.length ?? 0;
    if (now === 0) throw new Error(`Collectie ${name} is leeg; snapshot niet bijgewerkt.`);
    if (before && now < before * 0.5) throw new Error(`Collectie ${name} kromp van ${before} naar ${now} documenten; snapshot niet bijgewerkt.`);
}

const unchanged = previous && COLLECTIONS.every(n => JSON.stringify(previous[n]) === JSON.stringify(collections[n]));
if (unchanged) {
    console.log("Snapshot ongewijzigd.");
    setOutput("changed", "false");
} else {
    fs.writeFileSync(OUT, format(new Date().toISOString(), collections));
    console.log(`Snapshot geschreven naar ${OUT}.`);
    setOutput("changed", "true");
}
