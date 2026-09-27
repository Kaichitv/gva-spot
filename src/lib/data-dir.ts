import os from "node:os";
import path from "node:path";

// En serverless (Vercel), seul /tmp est inscriptible : éphémère, mais ça ne plante pas.
export const DATA_DIR = process.env.VERCEL
  ? path.join(os.tmpdir(), "gva-spot-data")
  : path.join(process.cwd(), "data");
