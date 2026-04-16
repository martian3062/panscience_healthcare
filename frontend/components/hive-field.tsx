"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";

import { sampleMissionGrade, type PointerState } from "@/lib/mission-grade";

type HiveFieldProps = {
  bias: [number, number];
  brightness?: number;
  drift?: [number, number];
  opacity?: number;
  planeSize: [number, number];
  pointer: PointerState;
  isDark: boolean;
  position?: [number, number, number];
  scale?: number;
};

const vertexShader = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = `
  precision highp float;

  uniform float uTime;
  uniform vec2 uResolution;
  uniform vec2 uPointer;
  uniform vec2 uBias;
  uniform vec2 uDrift;
  uniform float uScale;
  uniform float uOpacity;
  uniform float uBrightness;
  uniform vec3 uStar;
  uniform vec3 uAurora;
  uniform vec3 uMint;
  uniform vec3 uSolar;

  varying vec2 vUv;

  mat2 rot(float angle) {
    float s = sin(angle);
    float c = cos(angle);
    return mat2(c, -s, s, c);
  }

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);

    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));

    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
  }

  float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;

    for (int index = 0; index < 5; index += 1) {
      value += noise(p) * amplitude;
      p = rot(0.62) * p * 2.05 + 1.7;
      amplitude *= 0.52;
    }

    return value;
  }

  vec4 hexCoords(vec2 p) {
    vec2 r = vec2(1.7320508, 1.0);
    vec2 h = r * 0.5;
    vec2 a = mod(p, r) - h;
    vec2 b = mod(p - h, r) - h;
    vec2 gv = dot(a, a) < dot(b, b) ? a : b;
    vec2 id = p - gv;
    return vec4(gv, id);
  }

  float sdHex(vec2 p, float radius) {
    p = abs(p);
    return max(dot(p, normalize(vec2(1.0, 1.7320508))), p.x) - radius;
  }

  void main() {
    vec2 uv = vUv * 2.0 - 1.0;
    uv.x *= uResolution.x / max(uResolution.y, 1.0);

    vec2 pointer = uPointer * 0.22;
    vec2 flow = uv * uScale;
    flow += uDrift * uTime * 0.22;
    flow += vec2(fbm(uv * 1.8 + uTime * 0.06), fbm(uv * 1.6 - uTime * 0.05)) * 0.42;

    vec4 hc = hexCoords(flow);
    float edge = sdHex(hc.xy, 0.5);
    float cellFill = smoothstep(0.42, -0.22, edge);
    float cellLine = smoothstep(0.032, 0.0, abs(edge));

    float jitter = hash21(hc.zw * 0.07);
    float pulse = 0.5 + 0.5 * sin(uTime * 0.72 + jitter * 6.28318 + hc.z * 0.18 + hc.w * 0.14);
    float energy = fbm(hc.zw * 0.08 + vec2(uTime * 0.07, -uTime * 0.05));
    float plume = fbm(uv * 2.3 + vec2(uTime * 0.05, -uTime * 0.03));

    vec2 focus = uBias + pointer;
    float hiveCore = exp(-length((uv - focus) * vec2(1.05, 1.65)) * 2.1);
    float hiveTail = exp(-length((uv - vec2(focus.x - 0.65, focus.y + 0.18)) * vec2(1.5, 1.05)) * 3.0);
    float hiveAura = exp(-length((uv - vec2(focus.x + 0.28, focus.y - 0.14)) * vec2(1.2, 1.8)) * 2.8);
    float hiveMask = max(hiveCore, max(hiveTail * 0.72, hiveAura * 0.84));

    float filament = smoothstep(0.22, 0.0, abs(uv.y + fbm(vec2(uv.x * 1.4, uTime * 0.04)) * 0.28 - focus.y * 0.4));

    vec3 base = mix(uStar * 0.06, uAurora * 0.18, clamp(plume * 0.55 + hiveMask * 0.25, 0.0, 1.0));
    vec3 cellColor = mix(uAurora, uSolar, jitter * 0.52 + energy * 0.28);
    cellColor = mix(cellColor, uMint, pulse * 0.62);

    vec3 color = base;
    color += cellColor * cellFill * (0.12 + pulse * 0.34) * (0.25 + hiveMask * 1.55);
    color += mix(uMint, uSolar, energy) * cellLine * (0.78 + hiveMask * 0.92);
    color += mix(uAurora, uStar, filament) * filament * 0.1;

    float sparkle = step(0.995, fract(sin(dot(floor(flow * 2.0), vec2(12.9898, 78.233))) * 43758.5453123));
    color += uStar * sparkle * 0.45 * (0.3 + hiveMask);

    float vignette = smoothstep(1.7, 0.34, length(uv + vec2(-0.08, 0.0)));
    color *= vignette * uBrightness;

    float alpha = (cellFill * 0.12 + cellLine * 0.34 + hiveMask * 0.24 + plume * 0.06 + filament * 0.05) * uOpacity;
    alpha = clamp(alpha, 0.0, 1.0);

    gl_FragColor = vec4(color, alpha);
  }
`;

export function HiveField({
  bias,
  brightness = 1,
  drift = [0.32, -0.16],
  opacity = 0.8,
  planeSize,
  pointer,
  isDark,
  position = [0, 0, -5],
  scale = 4.6,
}: HiveFieldProps) {
  const { size } = useThree();
  const [biasX, biasY] = bias;
  const [driftX, driftY] = drift;
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        depthTest: false,
        uniforms: {
          uTime: { value: 0 },
          uResolution: { value: new THREE.Vector2(1, 1) },
          uPointer: { value: new THREE.Vector2(0, 0) },
          uBias: { value: new THREE.Vector2(biasX, biasY) },
          uDrift: { value: new THREE.Vector2(driftX, driftY) },
          uScale: { value: scale },
          uOpacity: { value: opacity },
          uBrightness: { value: brightness },
          uStar: { value: new THREE.Color("#eef5fb") },
          uAurora: { value: new THREE.Color("#8ecfdc") },
          uMint: { value: new THREE.Color("#7be1cf") },
          uSolar: { value: new THREE.Color("#f2df85") },
        },
        vertexShader,
        fragmentShader,
      }),
    [biasX, biasY, brightness, driftX, driftY, opacity, scale]
  );

  useEffect(() => {
    return () => {
      material.dispose();
    };
  }, [material]);

  useFrame((state) => {
    const time = state.clock.getElapsedTime();
    const grade = sampleMissionGrade(time, pointer, isDark);

    material.uniforms.uTime.value = time;
    material.uniforms.uResolution.value.set(size.width * state.gl.getPixelRatio(), size.height * state.gl.getPixelRatio());
    material.uniforms.uPointer.value.set(pointer.x, pointer.y);
    material.uniforms.uStar.value.setStyle(grade.star);
    material.uniforms.uAurora.value.setStyle(grade.aurora);
    material.uniforms.uMint.value.setStyle(grade.mint);
    material.uniforms.uSolar.value.setStyle(grade.solar);
  });

  return (
    <mesh position={position} renderOrder={-5}>
      <planeGeometry args={[planeSize[0], planeSize[1], 1, 1]} />
      <primitive attach="material" object={material} />
    </mesh>
  );
}
