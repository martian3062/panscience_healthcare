"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

import { HiveField } from "@/components/hive-field";
import { sampleMissionGrade, type PointerState } from "@/lib/mission-grade";

function AtmospherePlane({ pointer, isDark }: { pointer: PointerState, isDark: boolean }) {
  const backPlaneRef = useRef<THREE.MeshBasicMaterial>(null);
  const sidePlaneRef = useRef<THREE.MeshBasicMaterial>(null);

  useFrame((state) => {
    const grade = sampleMissionGrade(state.clock.getElapsedTime(), pointer, isDark);

    if (backPlaneRef.current) {
      backPlaneRef.current.color.setStyle(grade.bodyMid);
    }

    if (sidePlaneRef.current) {
      sidePlaneRef.current.color.setStyle(grade.solar);
    }
  });

  return (
    <>
      <mesh position={[0, 0, -7.8]}>
        <planeGeometry args={[36, 22]} />
        <meshBasicMaterial ref={backPlaneRef} color="#eef2f5" transparent opacity={isDark ? 0.4 : 0.88} />
      </mesh>
      <mesh position={[6.4, -0.8, -6.8]} rotation={[0, 0, -0.12]}>
        <planeGeometry args={[16, 14]} />
        <meshBasicMaterial ref={sidePlaneRef} color="#e5ebef" transparent opacity={0.34} />
      </mesh>
    </>
  );
}

function StarField({ pointer, isDark }: { pointer: PointerState, isDark: boolean }) {
  const pointsRef = useRef<THREE.Points>(null);
  const materialRef = useRef<THREE.PointsMaterial>(null);
  const { positions, colors } = useMemo(() => {
    const count = 920;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const silver = new THREE.Color("#f4f8fb");
    const aqua = new THREE.Color("#8ecfdc");
    const mint = new THREE.Color("#7be1cf");

    for (let index = 0; index < count; index += 1) {
      const offset = index * 3;
      positions[offset] = (Math.random() - 0.2) * 24;
      positions[offset + 1] = (Math.random() - 0.5) * 15;
      positions[offset + 2] = (Math.random() - 0.5) * 12;

      const color = silver.clone().lerp(index % 4 === 0 ? mint : aqua, Math.random() * 0.45);
      colors[offset] = color.r;
      colors[offset + 1] = color.g;
      colors[offset + 2] = color.b;
    }

    return { positions, colors };
  }, []);

  useFrame((state) => {
    const time = state.clock.getElapsedTime();
    const grade = sampleMissionGrade(time, pointer, isDark);

    if (pointsRef.current) {
      pointsRef.current.rotation.y = time * 0.014 + pointer.x * 0.08;
      pointsRef.current.rotation.x = -0.16 + pointer.y * 0.05;
      pointsRef.current.position.x = pointer.x * 0.35;
      pointsRef.current.position.y = pointer.y * 0.14;
    }

    if (materialRef.current) {
      materialRef.current.color.setStyle(grade.star);
      materialRef.current.opacity = 0.62 + Math.sin(time * 0.18) * 0.08;
    }
  });

  return (
    <points ref={pointsRef} position={[0, 0, -1.8]}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <pointsMaterial
        ref={materialRef}
        size={0.055}
        transparent
        opacity={0.68}
        sizeAttenuation
        vertexColors
        depthWrite={false}
      />
    </points>
  );
}

function SignalBands({ pointer, isDark }: { pointer: PointerState, isDark: boolean }) {
  const groupRef = useRef<THREE.Group>(null);
  const materialRefs = useRef<THREE.MeshBasicMaterial[]>([]);
  const rings = useMemo(
    () => [
      {
        radius: 4.9,
        tube: 0.03,
        opacity: 0.13,
        position: [4.4, 0.2, -3.6] as [number, number, number],
        rotation: [1.08, 0.24, 0.4] as [number, number, number],
      },
      {
        radius: 4.05,
        tube: 0.024,
        opacity: 0.1,
        position: [4.05, 0.08, -3.2] as [number, number, number],
        rotation: [0.62, 0.9, 0.18] as [number, number, number],
      },
      {
        radius: 3.35,
        tube: 0.018,
        opacity: 0.12,
        position: [3.8, -0.12, -2.8] as [number, number, number],
        rotation: [1.38, 0.18, 0.92] as [number, number, number],
      },
    ],
    []
  );

  useFrame((state) => {
    const time = state.clock.getElapsedTime();
    const grade = sampleMissionGrade(time, pointer, isDark);
    if (groupRef.current) {
      groupRef.current.rotation.y = time * 0.05 + pointer.x * 0.08;
      groupRef.current.rotation.x = pointer.y * 0.03;
    }

    const colors = [grade.line, grade.mint, grade.solar];
    materialRefs.current.forEach((material, index) => {
      material.color.setStyle(colors[index] ?? grade.aqua);
      material.opacity = rings[index]?.opacity ?? 0.1;
    });
  });

  return (
    <group ref={groupRef}>
      {rings.map((ring, index) => (
        <mesh key={`${ring.radius}-${index}`} position={ring.position} rotation={ring.rotation}>
          <torusGeometry args={[ring.radius, ring.tube, 14, 220]} />
          <meshBasicMaterial
            ref={(node) => {
              if (node) materialRefs.current[index] = node;
            }}
            color="#b9d6e6"
            transparent
            opacity={ring.opacity}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      ))}
    </group>
  );
}

function HiveCluster({ pointer, isDark }: { pointer: PointerState, isDark: boolean }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);
  const tempObject = useRef(new THREE.Object3D());
  const cells = useMemo(
    () =>
      Array.from({ length: 86 }, (_, index) => {
        const spread = Math.random();
        const angle = Math.random() * Math.PI * 2;
        const radius = 0.4 + spread * 2.7;

        return {
          basePosition: new THREE.Vector3(
            3.15 + Math.cos(angle) * radius * 0.58 + Math.random() * 1.1,
            -0.1 + (Math.random() - 0.5) * 2.9,
            -2.8 + Math.sin(angle) * radius * 0.78
          ),
          rotation: new THREE.Vector3(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI),
          scale: 0.05 + Math.random() * 0.15,
          speed: 0.2 + Math.random() * 0.55,
          phase: Math.random() * Math.PI * 2,
          wobble: 0.02 + Math.random() * 0.06,
          twist: (Math.random() - 0.5) * 0.18,
        };
      }),
    []
  );

  useFrame((state) => {
    const time = state.clock.getElapsedTime();
    const grade = sampleMissionGrade(time, pointer, isDark);
    const mesh = meshRef.current;
    const material = materialRef.current;
    if (!mesh || !material) return;

    cells.forEach((cell, index) => {
      const pulse = time * cell.speed + cell.phase;
      tempObject.current.position.set(
        cell.basePosition.x + Math.cos(pulse) * cell.wobble + pointer.x * 0.34,
        cell.basePosition.y + Math.sin(pulse * 1.3) * cell.wobble + pointer.y * 0.14,
        cell.basePosition.z + Math.sin(pulse) * cell.wobble * 1.4
      );
      tempObject.current.rotation.set(
        cell.rotation.x + pulse * 0.12,
        cell.rotation.y + pulse * 0.18,
        cell.rotation.z + pulse * cell.twist
      );
      const scale = cell.scale * (0.92 + Math.sin(pulse * 1.6) * 0.14);
      tempObject.current.scale.set(scale, scale * 1.45, scale * 0.94);
      tempObject.current.updateMatrix();
      mesh.setMatrixAt(index, tempObject.current.matrix);
    });

    mesh.instanceMatrix.needsUpdate = true;
    material.color.setStyle(grade.solar);
    material.opacity = 0.18 + Math.sin(time * 0.22) * 0.04;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, cells.length]}>
      <icosahedronGeometry args={[1, 0]} />
      <meshBasicMaterial ref={materialRef} color="#f2df85" transparent opacity={0.18} />
    </instancedMesh>
  );
}

function DataSheet({ pointer, isDark }: { pointer: PointerState, isDark: boolean }) {
  const groupRef = useRef<THREE.Group>(null);
  const wireRef = useRef<THREE.MeshBasicMaterial>(null);
  const planeRef = useRef<THREE.MeshBasicMaterial>(null);

  useFrame((state) => {
    const time = state.clock.getElapsedTime();
    const grade = sampleMissionGrade(time, pointer, isDark);
    if (!groupRef.current) return;

    groupRef.current.rotation.z = -0.18 + Math.sin(time * 0.16) * 0.02;
    groupRef.current.rotation.y = 0.12 + pointer.x * 0.05;
    groupRef.current.position.x = 5.1 + pointer.x * 0.8;
    groupRef.current.position.y = -1.6 + pointer.y * 0.35;

    if (wireRef.current) {
      wireRef.current.color.setStyle(grade.line);
      wireRef.current.opacity = 0.08 + Math.sin(time * 0.2) * 0.03;
    }

    if (planeRef.current) {
      planeRef.current.color.setStyle(grade.bodyTop);
      planeRef.current.opacity = 0.04 + Math.sin(time * 0.15 + 1.1) * 0.02;
    }
  });

  return (
    <group ref={groupRef} position={[5.1, -1.6, -4.2]} rotation={[-0.95, 0.42, -0.18]}>
      <mesh>
        <planeGeometry args={[7.4, 3.4, 18, 12]} />
        <meshBasicMaterial ref={wireRef} color="#deebf2" wireframe transparent opacity={0.11} />
      </mesh>
      <mesh position={[0, 0, -0.02]}>
        <planeGeometry args={[7.2, 3.2]} />
        <meshBasicMaterial ref={planeRef} color="#edf2f5" transparent opacity={0.06} />
      </mesh>
    </group>
  );
}

function Probe({ pointer, isDark }: { pointer: PointerState, isDark: boolean }) {
  const groupRef = useRef<THREE.Group>(null);
  const coneRef = useRef<THREE.MeshStandardMaterial>(null);
  const trailRef = useRef<THREE.MeshBasicMaterial>(null);

  useFrame((state) => {
    const time = state.clock.getElapsedTime();
    const grade = sampleMissionGrade(time, pointer, isDark);
    if (!groupRef.current) return;

    const orbit = time * 0.34;
    groupRef.current.position.x = 1.8 + Math.cos(orbit) * 2.3 + pointer.x * 0.75;
    groupRef.current.position.y = -0.4 + Math.sin(orbit * 1.5) * 0.8 + pointer.y * 0.28;
    groupRef.current.position.z = -1.2 + Math.sin(orbit) * 1.15;
    groupRef.current.rotation.z = orbit + Math.PI / 2;
    groupRef.current.rotation.y = -0.45 + pointer.x * 0.18;

    if (coneRef.current) {
      coneRef.current.color.setStyle(grade.star);
      coneRef.current.emissive.setStyle(grade.mint);
    }

    if (trailRef.current) {
      trailRef.current.color.setStyle(grade.aurora);
      trailRef.current.opacity = 0.22 + Math.sin(time * 0.3 + 0.5) * 0.06;
    }
  });

  return (
    <group ref={groupRef}>
      <mesh rotation={[0, 0, -Math.PI / 2]}>
        <coneGeometry args={[0.14, 0.48, 6]} />
        <meshStandardMaterial ref={coneRef} color="#ffffff" emissive="#86ded1" emissiveIntensity={0.34} roughness={0.32} />
      </mesh>
      <mesh position={[-0.24, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.015, 0.055, 0.56, 10]} />
        <meshBasicMaterial ref={trailRef} color="#94d8d1" transparent opacity={0.3} />
      </mesh>
    </group>
  );
}

function DataBeams({ pointer, isDark }: { pointer: PointerState, isDark: boolean }) {
  const groupRef = useRef<THREE.Group>(null);
  const materialRefs = useRef<THREE.MeshBasicMaterial[]>([]);
  const beams = useMemo(
    () => [
      { position: [-2.2, 2.3, -3.8], rotation: [0.06, 0.18, 0.16], width: 9.4, opacity: 0.12 },
      { position: [-1.4, -2.1, -3.2], rotation: [0.04, 0.22, -0.14], width: 7.8, opacity: 0.08 },
      { position: [2.2, 1.2, -2.4], rotation: [0.04, -0.14, 0.2], width: 6.8, opacity: 0.09 },
    ],
    []
  );

  useFrame((state) => {
    const time = state.clock.getElapsedTime();
    const grade = sampleMissionGrade(time, pointer, isDark);
    if (!groupRef.current) return;

    groupRef.current.rotation.z = Math.sin(time * 0.08) * 0.02;
    groupRef.current.position.x = pointer.x * 0.22;
    groupRef.current.position.y = pointer.y * 0.1;

    const colors = [grade.line, grade.aqua, grade.mint];
    materialRefs.current.forEach((material, index) => {
      material.color.setStyle(colors[index] ?? grade.star);
      material.opacity = beams[index]?.opacity ?? 0.08;
    });
  });

  return (
    <group ref={groupRef}>
      {beams.map((beam, index) => (
        <mesh
          key={`${beam.width}-${index}`}
          position={beam.position as [number, number, number]}
          rotation={beam.rotation as [number, number, number]}
        >
          <boxGeometry args={[beam.width, 0.03, 0.03]} />
          <meshBasicMaterial
            ref={(node) => {
              if (node) materialRefs.current[index] = node;
            }}
            color="#dce7ee"
            transparent
            opacity={beam.opacity}
          />
        </mesh>
      ))}
    </group>
  );
}

function MissionLightRig({ pointer, isDark }: { pointer: PointerState, isDark: boolean }) {
  const ambientRef = useRef<THREE.AmbientLight>(null);
  const directionalRef = useRef<THREE.DirectionalLight>(null);
  const pointRef = useRef<THREE.PointLight>(null);

  useFrame((state) => {
    const grade = sampleMissionGrade(state.clock.getElapsedTime(), pointer, isDark);

    if (ambientRef.current) {
      ambientRef.current.color.setStyle(grade.star);
    }

    if (directionalRef.current) {
      directionalRef.current.color.setStyle(grade.solar);
    }

    if (pointRef.current) {
      pointRef.current.color.setStyle(grade.mint);
    }
  });

  return (
    <>
      <ambientLight ref={ambientRef} intensity={0.74} />
      <directionalLight ref={directionalRef} position={[6, 4, 6]} intensity={1.45} color="#ffffff" />
      <pointLight ref={pointRef} position={[2, 0, 2]} intensity={4.2} color="#8fded4" />
    </>
  );
}

export function MissionBackground({ pointer, isDark }: { pointer: PointerState, isDark: boolean }) {
  return (
    <div className="mission-background" aria-hidden="true">
      <Canvas camera={{ position: [0, 0, 10], fov: 36 }} dpr={[1.2, 2]} gl={{ alpha: true, antialias: true }}>
        <MissionLightRig pointer={pointer} isDark={isDark} />
        <HiveField
          pointer={pointer}
          isDark={isDark}
          planeSize={[28, 18]}
          position={[1.2, -0.1, -6.4]}
          scale={5.8}
          opacity={isDark ? 0.45 : 0.92}
          brightness={isDark ? 0.35 : 1.08}
          drift={[0.42, -0.2]}
          bias={[0.56, 0.04]}
        />
        <AtmospherePlane pointer={pointer} isDark={isDark} />
        <StarField pointer={pointer} isDark={isDark} />
        <HiveCluster pointer={pointer} isDark={isDark} />
        <DataBeams pointer={pointer} isDark={isDark} />
        <SignalBands pointer={pointer} isDark={isDark} />
        <DataSheet pointer={pointer} isDark={isDark} />
        <Probe pointer={pointer} isDark={isDark} />
      </Canvas>
    </div>
  );
}
