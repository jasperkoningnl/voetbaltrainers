import fs from 'node:fs';
import { validateDataset } from '../../dashboard-store.mjs';

const data = JSON.parse(fs.readFileSync('data/snapshot.json', 'utf8'));
validateDataset(data);
console.log(`Gecontroleerd: ${data.clubs.length} clubs, ${data.coaches.length} trainers, ${data.seizoenen.length} seizoenen.`);
