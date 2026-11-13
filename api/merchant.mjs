import { createVercelPreview } from '../apps/hosted/src/vercel-preview.mjs';

export default {
  fetch: createVercelPreview(),
};
