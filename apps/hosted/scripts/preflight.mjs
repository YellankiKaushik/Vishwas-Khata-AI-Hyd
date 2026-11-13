import { readFile } from 'node:fs/promises';

const gate = JSON.parse(await readFile(new URL('../release-gate.json', import.meta.url), 'utf8'));
const environment = ['HOSTED_DATABASE_URL', 'HOSTED_DATABASE_CA', 'HOSTED_SESSION_SECRET', 'HOSTED_PUBLIC_ORIGIN'];
const status = {
  mode: gate.mode,
  public_deployment_allowed: gate.public_deployment_allowed,
  missing_environment_names: environment.filter((name) => !process.env[name]),
  unresolved_acceptance: gate.required_before_public_deployment,
};

export const publicReleaseReady = status.public_deployment_allowed === true &&
  status.unresolved_acceptance.length === 0 && status.missing_environment_names.length === 0;

if (import.meta.main) {
  // Report environment names and presence only.
  console.log(JSON.stringify(status, null, 2));
  if (!publicReleaseReady) process.exitCode = 1;
}
