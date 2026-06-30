import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const source = path.join(root, 'matcher-source', 'thrivetherapy-matchingdemo.html');
const html = fs.readFileSync(source, 'utf8');

const style = html.match(/<style>([\s\S]*?)<\/style>/)?.[1]?.trim();
const body = html.match(/<body>([\s\S]*?)<\/body>/)?.[1]?.trim();
const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1]?.trim();

if (!style || !body || !script) {
  console.error('Could not parse matcher HTML');
  process.exit(1);
}

fs.writeFileSync(path.join(root, 'app', 'matcher.css'), style);
fs.writeFileSync(path.join(root, 'public', 'matcher', 'body.html'), body);
fs.writeFileSync(path.join(root, 'public', 'matcher', 'matcher-app.js'), script);
console.log('Matcher assets split: app/matcher.css, public/matcher/*');
