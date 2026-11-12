import * as THREE from "three";

/** Locomotion states (loop) and one-shot emotes, as in the original. */
export const STATES = [
  "Idle",
  "Walking",
  "Running",
  "Dance",
  "Death",
  "Sitting",
  "Standing",
] as const;

export const EMOTES = [
  "Jump",
  "Yes",
  "No",
  "Wave",
  "Punch",
  "ThumbsUp",
] as const;

/**
 * Mixer ownership ported from `createGUI`/`fadeToAction` in
 * webgl_animation_skinning_morph. The scene drives `update` from
 * `useFrame`; the DOM panel only writes `pendingState`/`pendingEmote`
 * and morph influences, so no cross-root atoms are needed.
 */
export class RobotController {
  mixer: THREE.AnimationMixer | null = null;
  actions: Record<string, THREE.AnimationAction> = {};
  active: THREE.AnimationAction | null = null;
  previous: THREE.AnimationAction | null = null;
  face: THREE.Mesh | null = null;
  expressions: string[] = [];
  loaded = false;
  state: string = "Walking";
  pendingState: string | null = null;
  pendingEmote: string | null = null;

  setup(model: THREE.Object3D, animations: THREE.AnimationClip[]): void {
    this.mixer = new THREE.AnimationMixer(model);
    for (const clip of animations) {
      const action = this.mixer.clipAction(clip);
      this.actions[clip.name] = action;
      if (
        (EMOTES as readonly string[]).includes(clip.name) ||
        STATES.indexOf(clip.name as (typeof STATES)[number]) >= 4
      ) {
        action.clampWhenFinished = true;
        action.loop = THREE.LoopOnce;
      }
    }
    const face = model.getObjectByName("Head_4") as THREE.Mesh | undefined;
    if (
      face !== undefined &&
      face.morphTargetDictionary !== undefined &&
      face.morphTargetInfluences !== undefined
    ) {
      this.face = face;
      this.expressions = Object.keys(face.morphTargetDictionary);
    }
    this.fadeToAction(this.state, 0.5);
    this.loaded = true;
  }

  fadeToAction(name: string, duration: number): void {
    const next = this.actions[name];
    if (next === undefined) {
      return;
    }
    this.previous = this.active;
    this.active = next;
    if (this.previous !== null && this.previous !== this.active) {
      this.previous.fadeOut(duration);
    }
    this.active.reset().setEffectiveTimeScale(1).setEffectiveWeight(1);
    this.active.fadeIn(duration);
    this.active.play();
  }

  playEmote(name: string): void {
    if (this.mixer === null) {
      return;
    }
    this.fadeToAction(name, 0.2);
    this.mixer.addEventListener("finished", this.restoreState);
  }

  restoreState = (): void => {
    this.mixer?.removeEventListener("finished", this.restoreState);
    this.fadeToAction(this.state, 0.2);
  };

  setExpression(index: number, value: number): void {
    if (this.face?.morphTargetInfluences !== undefined) {
      this.face.morphTargetInfluences[index] = value;
    }
  }

  /** Called every frame from `useFrame`. */
  update(delta: number): void {
    if (this.pendingState !== null) {
      this.state = this.pendingState;
      this.pendingState = null;
      this.fadeToAction(this.state, 0.5);
    }
    if (this.pendingEmote !== null) {
      const emote = this.pendingEmote;
      this.pendingEmote = null;
      this.playEmote(emote);
    }
    this.mixer?.update(delta);
  }
}

export const controller = new RobotController();
