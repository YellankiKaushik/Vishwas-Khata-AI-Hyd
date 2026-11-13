import { readFile } from 'node:fs/promises';

const gate = JSON.parse(await readFile(new URL('../release-gate.json', import.meta.url), 'utf8'));
const environment = ['HOSTED_DATABASE_URL', 'HOSTED_DATABASE_CA', 'HOSTED_SESSION_SECRET', 'HOSTED_PUBLIC_ORIGIN'];
// Report names and presence only. Never emit connection strings or credentials.
console.log(JSON.stringify({
  mode: gate.mode,
  public_deployment_allowed: gate.public_deployment_allowed,
  missing_environment_names: environment.filter((name) => !process.env[name]),
  unresolved_acceptance: gate.required_before_public_deployment,
}, null, 2));
if (!gate.public_deployment_allowed || gate.required_before_public_deployment.length ||
    environment.some((name) => !process.env[name])) process.exitCode = 1;
