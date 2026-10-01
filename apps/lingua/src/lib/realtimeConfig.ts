/**
 * Realtime session configuration (GA shape), shared by the server, which
 * mints the session, and the browser, which updates it mid-call.
 */
import type { ResolvedSetup } from "./setup";
import { composeInstructions, outputSpeed, type PolicyState, INITIAL_POLICY } from "./policy";
import { TOOLS } from "./tools";

export type SessionOptions = {
  model: string;
  /** Transcription model for the learner's speech, or null to skip captions. */
  transcriptionModel: string | null;
};

/**
 * Hint for the transcriber: the learner may switch languages mid-sentence.
 * Leaving `language` unset lets it follow them rather than force one.
 */
export function transcriptionPrompt(s: ResolvedSetup): string {
  return `A ${s.support.name} speaker practicing ${s.target.name}; speech may mix ${s.target.name} and ${s.support.name}.`;
}

export function buildSessionConfig(
  s: ResolvedSetup,
  opts: SessionOptions,
  policy: PolicyState = INITIAL_POLICY
) {
  return {
    type: "realtime" as const,
    model: opts.model,
    instructions: composeInstructions(s, policy),
    output_modalities: ["audio"],
    audio: {
      input: {
        noise_reduction: { type: "near_field" },
        ...(opts.transcriptionModel
          ? { transcription: { model: opts.transcriptionModel, prompt: transcriptionPrompt(s) } }
          : {}),
        turn_detection: {
          type: "semantic_vad",
          eagerness: s.level.eagerness,
          create_response: true,
          interrupt_response: true,
        },
      },
      output: {
        voice: s.persona.voice,
        speed: outputSpeed(s, policy),
      },
    },
    tools: TOOLS,
    tool_choice: "auto",
  };
}

/**
 * The part of the session that changes mid-call. The voice is left out: it
 * cannot change once the partner has spoken.
 */
export function buildSessionUpdate(s: ResolvedSetup, policy: PolicyState) {
  return {
    type: "session.update",
    session: {
      type: "realtime",
      instructions: composeInstructions(s, policy),
      audio: {
        input: {
          turn_detection: {
            type: "semantic_vad",
            // A struggling learner needs more time to finish a thought.
            eagerness: policy.scaffold >= 2 ? "low" : s.level.eagerness,
            create_response: true,
            interrupt_response: true,
          },
        },
        output: { speed: outputSpeed(s, policy) },
      },
    },
  };
}
