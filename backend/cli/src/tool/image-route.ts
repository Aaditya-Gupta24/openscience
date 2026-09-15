import { Provider } from "@/provider/provider"
import { OpenScience } from "@/openscience"
import { Env } from "@/env"

/**
 * Which account, if any, can render images. Image generation only runs on a
 * key the person owns: the managed billing route does not proxy the image
 * endpoints, so a managed key is not a route. The system prompt states the
 * answer up front so the agent draws with TikZ or matplotlib instead of
 * loading the schematics skill, calling the tool and failing.
 */
export namespace ImageRoute {
  export type Route = {
    kind: "gemini" | "openrouter"
    key: string
    base: string
    label: string
    rank: number
  }

  export async function resolve(): Promise<Route | undefined> {
    const google = await Provider.getProvider("google").catch(() => undefined)
    const openrouter = await Provider.getProvider("openrouter").catch(() => undefined)
    const googleKey = typeof google?.options?.apiKey === "string" ? google.options.apiKey : google?.key
    const openrouterKey = typeof openrouter?.options?.apiKey === "string" ? openrouter.options.apiKey : openrouter?.key
    const openrouterBase =
      typeof openrouter?.options?.baseURL === "string"
        ? openrouter.options.baseURL.replace(/\/+$/, "")
        : "https://openrouter.ai/api/v1"
    const ambient = (key: string, names: string[]) => names.some((name) => Env.get(name) === key)
    const candidates: Route[] = [
      ...(googleKey && !OpenScience.isManagedKeyValue(googleKey)
        ? [
            {
              kind: "gemini" as const,
              key: googleKey,
              base:
                typeof google?.options?.baseURL === "string"
                  ? google.options.baseURL.replace(/\/+$/, "")
                  : "https://generativelanguage.googleapis.com/v1beta",
              label: "the connected Gemini key",
              rank: ambient(googleKey, ["GOOGLE_GENERATIVE_AI_API_KEY", "GOOGLE_API_KEY", "GEMINI_API_KEY"]) ? 1 : 2,
            },
          ]
        : []),
      ...(openrouterKey && !OpenScience.isManagedKeyValue(openrouterKey)
        ? [
            {
              kind: "openrouter" as const,
              key: openrouterKey,
              base: openrouterBase,
              label: "the connected OpenRouter key",
              rank: ambient(openrouterKey, ["OPENROUTER_API_KEY"]) ? 1 : 2,
            },
          ]
        : []),
    ]
    return candidates.sort((a, b) => b.rank - a.rank)[0]
  }

  export const UNAVAILABLE =
    "Nano Banana is unavailable. Connect your Gemini or OpenRouter account in Customize → Models."

  /** The environment line the system prompt carries. */
  export async function line(): Promise<string> {
    const route = await resolve().catch(() => undefined)
    if (route) return `Image generation: available (generate_image via ${route.label})`
    return "Image generation: unavailable (no Gemini or OpenRouter key of the user's own is connected; draw schematics with TikZ, matplotlib or SVG and do not call generate_image)"
  }
}
