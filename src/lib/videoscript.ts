import { applyReplacements, type Replacement } from "./narration";
import type { MotionPlan } from "./motion";
import type { ScenePlan } from "./whiteboard";

/**
 * Helpers shared by the whiteboard and motion script editors: enforcing the
 * word-replacement list on a plan, and the scene list shown in the player.
 */

export function replaceInScenePlan(plan: ScenePlan, list: Replacement[]): ScenePlan {
  if (!list.length) return plan;
  const r = (s: string) => applyReplacements(s, list);
  return {
    ...plan,
    title: r(plan.title),
    description: r(plan.description),
    scenes: plan.scenes.map((s) => ({
      ...s,
      title: r(s.title).toUpperCase(),
      caption: r(s.caption),
      narration: r(s.narration),
    })),
  };
}

export function replaceInMotionPlan(plan: MotionPlan, list: Replacement[]): MotionPlan {
  if (!list.length) return plan;
  const r = (s: string) => applyReplacements(s, list);
  return {
    ...plan,
    title: r(plan.title),
    description: r(plan.description),
    scenes: plan.scenes.map((s) => ({
      ...s,
      headline: r(s.headline),
      subline: r(s.subline),
      callouts: s.callouts.map(r).filter(Boolean),
      stat: s.stat ? { ...s.stat, label: r(s.stat.label) } : undefined,
      narration: r(s.narration),
    })),
  };
}

export const whiteboardScenes = (plan: ScenePlan) =>
  plan.scenes.map((s) => ({
    title: s.title,
    caption: s.caption,
    narration: s.narration,
    step: s.step,
  }));

export const motionScenes = (plan: MotionPlan) =>
  plan.scenes.map((s) => ({
    title: s.headline,
    caption: s.subline,
    narration: s.narration,
    beat: s.beat,
  }));
