import type { AssistantMessage, Message, Part } from "@synsci/sdk/v2/client"

type ContextCategory = "instructions" | "user" | "assistant" | "tool"

/** The loaded transcript can describe available text, not the complete provider
 * payload. Keep this estimate independent of provider usage and its cache split. */
export function contextComposition(
  messages: Message[],
  parts: Record<string, Part[] | undefined>,
  call: AssistantMessage,
) {
  const end = messages.findIndex((message) => message.id === call.id)
  if (end < 0 || call.summary) return []
  const prior = messages.slice(0, end)
  const summary = prior.findLast(
    (message): message is AssistantMessage =>
      message.role === "assistant" &&
      message.summary === true &&
      Boolean(message.finish && message.finish !== "compact" && message.finish !== "length" && !message.error) &&
      (parts[message.id] ?? []).some((part) => part.type === "text" && part.text.trim()),
  )
  const carrier = summary
    ? prior.findIndex(
        (message) =>
          message.id === summary.parentID && (parts[message.id] ?? []).some((part) => part.type === "compaction"),
      )
    : -1
  const tail = summary?.tailStartId ? prior.findIndex((message) => message.id === summary.tailStartId) : -1
  const start = carrier < 0 ? 0 : tail >= 0 && tail < carrier ? tail : carrier
  const parent = prior.find((message) => message.id === call.parentID)
  const chars: Record<ContextCategory, number> = {
    instructions: parent?.role === "user" ? (parent.system?.length ?? 0) : 0,
    user: 0,
    assistant: 0,
    tool: 0,
  }

  for (const message of prior.slice(start)) {
    for (const part of parts[message.id] ?? []) {
      if (part.type === "text" && !part.ignored) chars[message.role] += part.text.length
      if (part.type !== "tool") continue
      if (part.state.status !== "completed" && part.state.status !== "error") continue
      chars.tool += part.tool.length + JSON.stringify(part.state.input).length
      if (part.state.status === "error") chars.tool += part.state.error.length
      if (part.state.status === "completed" && !part.state.time.compacted) chars.tool += part.state.output.length
    }
  }

  const entries = (Object.entries(chars) as Array<[ContextCategory, number]>).map(([key, count]) => ({
    key,
    tokens: Math.ceil(count / 4),
  }))
  const total = entries.reduce((sum, entry) => sum + entry.tokens, 0)
  return entries.filter((entry) => entry.tokens > 0).map((entry) => ({ ...entry, share: entry.tokens / total }))
}

export type ContextCompositionEstimate = {
  total: number
  tokens: {
    system: number
    text: number
    reasoning: number
    tool: number
    skills: number
    image: number
    document?: number
  }
}

export type ContextBucket =
  "system" | "text" | "reasoning" | "tool" | "skills" | "image" | "document" | "instructions" | "user" | "assistant"

/** These are server estimates of separate content buckets, not billed token allocations. */
export function recordedContextComposition(value: ContextCompositionEstimate) {
  return [
    { key: "system" as const, label: "System instructions", tokens: value.tokens.system },
    { key: "text" as const, label: "Conversation text", tokens: value.tokens.text },
    { key: "reasoning" as const, label: "Reasoning", tokens: value.tokens.reasoning },
    { key: "tool" as const, label: "Tool calls and results", tokens: value.tokens.tool },
    { key: "skills" as const, label: "Skills", tokens: value.tokens.skills },
    { key: "image" as const, label: "Images", tokens: value.tokens.image },
    { key: "document" as const, label: "Documents", tokens: value.tokens.document },
  ]
}

export type ContextSegment = { key: ContextBucket; label: string; tokens?: number; share: number }

/** Each bucket as a share of what the buckets add up to, so the filled part of
 * a usage bar can be divided between them. A bucket the server did not report
 * keeps its place in the legend and no width in the bar. */
export function contextSegments(
  entries: Array<{ key: ContextBucket; label: string; tokens?: number }>,
): ContextSegment[] {
  const total = entries.reduce((sum, entry) => sum + (entry.tokens ?? 0), 0)
  return entries.map((entry) => ({
    ...entry,
    share: total > 0 && entry.tokens ? entry.tokens / total : 0,
  }))
}

/** One colour per bucket, from the syntax palette so every theme has them. */
export const CONTEXT_BUCKET_COLORS: Record<ContextBucket, string> = {
  system: "var(--syntax-info)",
  instructions: "var(--syntax-info)",
  text: "var(--syntax-success)",
  user: "var(--syntax-success)",
  assistant: "var(--syntax-property)",
  reasoning: "var(--syntax-keyword)",
  tool: "var(--syntax-warning)",
  skills: "var(--syntax-property)",
  image: "var(--syntax-string)",
  document: "var(--syntax-type)",
}
