import type * as THREE from "three";

import type { ThreeEvent } from "./events.ts";

/** Vector / euler / color shorthand accepted for transform props. */
export type MathProp =
  | number
  | readonly [x: number, y: number, z: number]
  | readonly [x: number, y: number]
  | THREE.Vector2
  | THREE.Vector3
  | THREE.Euler
  | THREE.Color;

/** Pointer and wheel handlers on three elements (R3F `ThreeEvent` parity). */
export interface ThreeEventProps {
  onClick?: (event: ThreeEvent) => void;
  onContextMenu?: (event: ThreeEvent) => void;
  onDoubleClick?: (event: ThreeEvent) => void;
  onPointerUp?: (event: ThreeEvent) => void;
  onPointerDown?: (event: ThreeEvent) => void;
  onPointerOver?: (event: ThreeEvent) => void;
  onPointerOut?: (event: ThreeEvent) => void;
  onPointerEnter?: (event: ThreeEvent) => void;
  onPointerLeave?: (event: ThreeEvent) => void;
  onPointerMove?: (event: ThreeEvent) => void;
  onPointerMissed?: (event: ThreeEvent) => void;
  onPointerCancel?: (event: ThreeEvent) => void;
  onWheel?: (event: ThreeEvent) => void;
  onLostPointerCapture?: (event: ThreeEvent) => void;
}

/** Props every three.js JSX element accepts. */
export interface ThreeElementProps extends ThreeEventProps {
  /** Any other three.js property (`color`, `intensity`, `map`, …). */
  readonly [property: string]: unknown;
  /** Constructor arguments; changing them reconstructs the object. */
  args?: readonly unknown[];
  /**
   * Target on the parent to attach to (`"geometry"`, `"material"`,
   * `"material-0"`, or a `(parent, child)` function). Children whose tag
   * ends in `Geometry`/`Material` auto-attach to `geometry`/`material`.
   */
  attach?: string | ((parent: THREE.Object3D, child: THREE.Object3D) => void);
  /** Passed-through object for `<primitive object={...} />`. */
  object?: THREE.Object3D;
  /**
   * `dispose={null}` opts out of auto-dispose when the element unmounts.
   * Any other value (including omission) disposes on unmount.
   */
  dispose?: null | undefined;
  /** Called with the live object after props apply and on updates. */
  onUpdate?: (object: THREE.Object3D) => void;
  position?: MathProp;
  rotation?: MathProp;
  scale?: MathProp | number;
  children?: unknown;
  key?: string | number;
  ref?: unknown;
}

/** `<primitive object={...} attach={...} />` escape hatch. */
export interface PrimitiveProps extends ThreeElementProps {
  object: THREE.Object3D;
}

declare module "ilha/jsx-runtime" {
  // oxlint-disable-next-line typescript/no-namespace -- merges into ilha's JSX namespace
  namespace JSX {
    interface IntrinsicElements {
      primitive: ThreeElementProps & { object: unknown };
      mesh: ThreeElementProps;
      group: ThreeElementProps;
      scene: ThreeElementProps;
      object3D: ThreeElementProps;
      points: ThreeElementProps;
      // No `line`: it collides with SVG's <line>. Use <lineSegments>,
      // <lineLoop>, or extend({ Line: THREE.Line }) with a capital tag.
      lineSegments: ThreeElementProps;
      lineLoop: ThreeElementProps;
      sprite: ThreeElementProps;
      instancedMesh: ThreeElementProps;
      skinnedMesh: ThreeElementProps;
      meshStandardMaterial: ThreeElementProps;
      meshPhysicalMaterial: ThreeElementProps;
      meshBasicMaterial: ThreeElementProps;
      meshLambertMaterial: ThreeElementProps;
      meshPhongMaterial: ThreeElementProps;
      meshToonMaterial: ThreeElementProps;
      meshNormalMaterial: ThreeElementProps;
      meshDepthMaterial: ThreeElementProps;
      meshDistanceMaterial: ThreeElementProps;
      meshMatcapMaterial: ThreeElementProps;
      pointsMaterial: ThreeElementProps;
      lineBasicMaterial: ThreeElementProps;
      lineDashedMaterial: ThreeElementProps;
      spriteMaterial: ThreeElementProps;
      shaderMaterial: ThreeElementProps;
      rawShaderMaterial: ThreeElementProps;
      boxGeometry: ThreeElementProps;
      sphereGeometry: ThreeElementProps;
      planeGeometry: ThreeElementProps;
      cylinderGeometry: ThreeElementProps;
      coneGeometry: ThreeElementProps;
      torusGeometry: ThreeElementProps;
      torusKnotGeometry: ThreeElementProps;
      circleGeometry: ThreeElementProps;
      ringGeometry: ThreeElementProps;
      capsuleGeometry: ThreeElementProps;
      bufferGeometry: ThreeElementProps;
      dodecahedronGeometry: ThreeElementProps;
      icosahedronGeometry: ThreeElementProps;
      octahedronGeometry: ThreeElementProps;
      tetrahedronGeometry: ThreeElementProps;
      tubeGeometry: ThreeElementProps;
      latheGeometry: ThreeElementProps;
      extrudeGeometry: ThreeElementProps;
      shapeGeometry: ThreeElementProps;
      edgesGeometry: ThreeElementProps;
      wireframeGeometry: ThreeElementProps;
      perspectiveCamera: ThreeElementProps;
      orthographicCamera: ThreeElementProps;
      ambientLight: ThreeElementProps;
      directionalLight: ThreeElementProps;
      pointLight: ThreeElementProps;
      spotLight: ThreeElementProps;
      hemisphereLight: ThreeElementProps;
      rectAreaLight: ThreeElementProps;
      fog: ThreeElementProps;
      fogExp2: ThreeElementProps;
      gridHelper: ThreeElementProps;
      axesHelper: ThreeElementProps;
      polarGridHelper: ThreeElementProps;
      skeletonHelper: ThreeElementProps;
      boxHelper: ThreeElementProps;
      color: ThreeElementProps;
    }
  }
}
