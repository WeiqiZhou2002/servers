import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export type Action = "read" | "write" | "delete";
interface ActionRule { 
  enabled?: boolean; 
  allowed_extensions?: string[];            // default: any
  allowed_paths?: string[];                 // default: any
 }
interface PolicyFile {
  timezone?: string;
  actions?: Record<Action, ActionRule>;
}

const ENV_PATH = process.env.MCP_POLICY_FILE;

const FALLBACK_PATH = path.resolve(__dirname,  "..",  "policy.yml");
const CONFIG_PATH = ENV_PATH ?? FALLBACK_PATH;

function safeLoad(file?: string): PolicyFile {
  if (!file) {
    console.warn("No policy.yml found. Using permissive defaults.");
    return {} as PolicyFile;
  }
  try {
    const txt = fs.readFileSync(file, "utf-8");
    return YAML.parse(txt) as PolicyFile;
  } catch (e) {
    console.error(`⚠️  Failed to read ${file}. Using permissive defaults.`, e);
    return {} as PolicyFile;
  }
}

const normalizeExt = (ext: string) => ext.toLowerCase();

export class PolicyManager {
  private static policy: PolicyFile = safeLoad(CONFIG_PATH);

  /**
   * Enforce the current YAML rules against an action.  Throws 403‑style
   * Error with code="MCP_POLICY_VIOLATION" if disallowed.
   */
  static enforce(action: Action, filePath: string) {
    const rule = this.policy.actions?.[action] ?? {};

    /* 1. enabled flag */
    if (rule.enabled === false) {
      throw this.err(`Action '${action}' disabled by policy`);
    }

   /* 2 — extension checks */
   if (rule.allowed_extensions?.length) {
    const ext = normalizeExt(path.extname(filePath));
    const ok  = rule.allowed_extensions.map(normalizeExt).includes(ext);
    if (!ok) throw this.err(`${action} denied: extension '${ext}' not allowed`);
  }

   //TODO:path checks 
    
  }

  private static tz() {
    return this.policy.timezone ?? "America/Chicago";
  }

  private static err(msg: string) {
    return Object.assign(new Error(msg), {
      code: "MCP_POLICY_VIOLATION",
      httpStatus: 403,
    });
  }
}
// see if any change in config file
if (CONFIG_PATH) {
  fs.watch(CONFIG_PATH, { persistent: false }, () => {
    PolicyManager["policy"] = safeLoad(CONFIG_PATH);
    console.error(`[PolicyManager] Reloaded policy from ${CONFIG_PATH}`);
  });
}
