"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

import { HiveField } from "@/components/hive-field";
import { sampleMissionGrade, type PointerState } from "@/lib/mission-grade";

function HeroDust({ pointer, isDark }: { pointer: PointerState, isDark: boolean }) {
  const pointsRef = useRef<THREE.Points>(null);
  const materialRef = useRef<THREE.PointsMaterial>(null);
  const positions = useMemo(() => {
    const count = 280;
    const values = new Float32Array(count * 3);

    for (let index = 0; index < count; index += 1) {
      const offset = index * 3;
      values[offset] = (Math.random() - 0.5) * 7.4;
      values[offset + 1] = (Math.random() - 0.5) * 5.2;
      values[offset + 2] = (Math.random() - 0.5) * 4.4;
    }

    return values;
  }, []);

  useFrame((state) => {
    const time = state.clock.getElapsedTime();
    const grade = sampleMissionGrade(time, pointer);

    if (pointsRef.current) {
      pointsRef.current.rotation.y = time * 0.035 + pointer.x * 0.14;
      pointsRef.current.rotation.x = -0.18 + pointer.y * 0.08;
      pointsRef.current.position.x = pointer.x * 0.24;
      pointsRef.current.position.y = pointer.y * 0.1;
    }

    if (materialRef.current) {
      materialRef.current.color.setStyle(grade.star);
      materialRef.current.opacity = 0.44 + Math.sin(time * 0.22) * 0.08;
    }
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial ref={materialRef} color="#d7e7ef" size={0.044} transparent opacity={0.5} depthWrite={false} />
    </points>
  );
}

function SignalRibbon({ pointer, isDark }: { pointer: PointerState, isDark: boolean }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);
  const geometry = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-1.8, -1.2, -0.3),
      new THREE.Vector3(-0.7, -0.15, 0.5),
      new THREE.Vector3(0.15, 0.45, -0.2),
      new THREE.Vector3(1.35, 1.08, 0.4),
      new THREE.Vector3(2.3, 1.65, -0.45),
    ]);

    return new THREE.TubeGeometry(curve, 180, 0.04, 14, false);
  }, []);

  useFrame((state) => {
    const time = state.clock.getElapsedTime();
    const grade = sampleMissionGrade(time, pointer, isDark);

    if (meshRef.current) {
      meshRef.current.rotation.z = Math.sin(time * 0.45) * 0.08;
      meshRef.current.rotation.y = pointer.x * 0.16 - 0.12;
      meshRef.current.position.x = pointer.x * 0.22;
      meshRef.current.position.y = pointer.y * 0.12;
    }

    if (materialRef.current) {
      materialRef.current.color.setStyle(grade.mint);
      materialRef.current.opacity = 0.2 + Math.sin(time * 0.3 + 0.8) * 0.05;
    }
  });

  return (
    <mesh ref={meshRef} geometry={geometry} position={[0.1, -0.2, 0.2]}>
      <meshBasicMaterial ref={materialRef} color="#7be1cf" transparent opacity={0.22} />
    </mesh>
  );
}

function OrbitStack({ pointer, isDark }: { pointer: PointerState, isDark: boolean }) {
  const groupRef = useRef<THREE.Group>(null);
  const materialRefs = useRef<THREE.MeshBasicMaterial[]>([]);
  const rings = useMemo(
    () => [
      { radius: 1.78, tube: 0.028, rotation: [1.2, 0.24, 0.42], opacity: 0.34 },
      { radius: 1.45, tube: 0.02, rotation: [0.3, 1.08, 0.18], opacity: 0.18 },
      { radius: 1.12, tube: 0.016, rotation: [1.54, 0.38, 0.86], opacity: 0.28 },
    ],
    []
  );

  useFrame((state) => {
    const time = state.clock.getElapsedTime();
    const grade = sampleMissionGrade(time, pointer, isDark);
    if (groupRef.current) {
      groupRef.current.rotation.y = time * 0.18 + pointer.x * 0.18;
      groupRef.current.rotation.x = -0.28 + pointer.y * 0.14;
    }

    const colors = [grade.line, grade.aurora, grade.solar];
    materialRefs.current.forEach((material, index) => {
      material.color.setStyle(colors[index] ?? grade.aqua);
      material.opacity = rings[index]?.opacity ?? 0.2;
    });
  });

  return (
    <group ref={groupRef} position={[0.45, -0.05, 0]}>
      {rings.map((ring, index) => (
        <mesh
          key={`${ring.radius}-${index}`}
          rotation={ring.rotation as [number, number, number]}
          position={[0, 0, index * 0.08 - 0.06]}
        >
          <torusGeometry args={[ring.radius, ring.tube, 18, 220]} />
          <meshBasicMaterial
            ref={(node) => {
              if (node) materialRefs.current[index] = node;
            }}
            color="#cfe0eb"
            transparent
            opacity={ring.opacity}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      ))}
    </group>
  );
}

function RelayCore({ pointer, isDark }: { pointer: PointerState, isDark: boolean }) {
  const groupRef = useRef<THREE.Group>(null);
  const shellRef = useRef<THREE.MeshStandardMaterial>(null);
  const wireRef = useRef<THREE.MeshBasicMaterial>(null);
  const coreRef = useRef<THREE.MeshStandardMaterial>(null);
  const satelliteRefs = useRef<THREE.MeshBasicMaterial[]>([]);
  const satellites = useMemo(
    () =>
      Array.from({ length: 12 }, (_, index) => {
        const angle = (Math.PI * 2 * index) / 12;
        return {
          position: [Math.cos(angle) * 1.55, Math.sin(angle * 1.2) * 0.85, Math.sin(angle) * 0.95] as [
            number,
            number,
            number,
          ],
          scale: index % 3 === 0 ? 0.08 : 0.06,
        };
      }),
    []
  );

  useFrame((state) => {
    const time = state.clock.getElapsedTime();
    const grade = sampleMissionGrade(time, pointer, isDark);

    if (groupRef.current) {
      groupRef.current.rotation.y = time * 0.28 + pointer.x * 0.22;
      groupRef.current.rotation.x = -0.18 + pointer.y * 0.16;
      groupRef.current.position.x = 0.4 + pointer.x * 0.28;
      groupRef.current.position.y = pointer.y * 0.16;
    }

    if (shellRef.current) {
      shellRef.current.color.setStyle(grade.star);
    }

    if (wireRef.current) {
      wireRef.current.color.setStyle(grade.aqua);
      wireRef.current.opacity = 0.12 + Math.sin(time * 0.22) * 0.04;
    }

    if (coreRef.current) {
      coreRef.current.color.setStyle(grade.solar);
      coreRef.current.emissive.setStyle(grade.mint);
      coreRef.current.emissiveIntensity = 0.6 + Math.sin(time * 0.35) * 0.08;
    }

    satelliteRefs.current.forEach((material, index) => {
      material.color.setStyle(index % 2 === 0 ? grade.aurora : grade.solar);
      material.opacity = 0.54 + Math.sin(time * 0.25 + index * 0.2) * 0.12;
    });
  });

  return (
    <group ref={groupRef} position={[0.4, -0.15, 0]}>
      <mesh>
        <icosahedronGeometry args={[1.12, 1]} />
        <meshStandardMaterial ref={shellRef} color="#fbfeff" roughness={0.2} metalness={0.28} transparent opacity={0.72} />
      </mesh>
      <mesh scale={1.18}>
        <icosahedronGeometry args={[1.12, 1]} />
        <meshBasicMaterial ref={wireRef} color="#9ed3de" wireframe transparent opacity={0.16} />
      </mesh>
      <mesh scale={0.44}>
        <sphereGeometry args={[1, 20, 20]} />
        <meshStandardMaterial ref={coreRef} color="#8de6d2" emissive="#7be1cf" emissiveIntensity={0.6} roughness={0.16} />
      </mesh>
      {satellites.map((satellite, index) => (
        <mesh key={index} position={satellite.position}>
          <sphereGeometry args={[satellite.scale, 12, 12]} />
          <meshBasicMaterial
            ref={(node) => {
              if (node) satelliteRefs.current[index] = node;
            }}
            color={index % 2 === 0 ? "#dbe8ef" : "#7be1cf"}
            transparent
            opacity={0.7}
          />
        </mesh>
      ))}
    </group>
  );
}

function HeroLightRig({ pointer, isDark }: { pointer: PointerState, isDark: boolean }) {
  const ambientRef = useRef<THREE.AmbientLight>(null);
  const directionalRef = useRef<THREE.DirectionalLight>(null);
  const frontPointRef = useRef<THREE.PointLight>(null);
  const sidePointRef = useRef<THREE.PointLight>(null);

  useFrame((state) => {
    const grade = sampleMissionGrade(state.clock.getElapsedTime(), pointer, isDark);

    if (ambientRef.current) {
      ambientRef.current.color.setStyle(grade.star);
    }

    if (directionalRef.current) {
      directionalRef.current.color.setStyle(grade.solar);
    }

    if (frontPointRef.current) {
      frontPointRef.current.color.setStyle(grade.mint);
    }

    if (sidePointRef.current) {
      sidePointRef.current.color.setStyle(grade.aqua);
    }
  });

  return (
    <>
      <ambientLight ref={ambientRef} intensity={0.88} />
      <directionalLight ref={directionalRef} position={[4, 3, 4]} intensity={1.8} color="#ffffff" />
      <pointLight ref={frontPointRef} position={[0.5, 0.2, 3]} intensity={7} color="#8fe4d4" />
      <pointLight ref={sidePointRef} position={[-2.8, -1.6, 2]} intensity={5} color="#dde9f1" />
    </>
  );
}

export function FluidScene({ pointer, isDark }: { pointer: PointerState, isDark: boolean }) {
  return (
    <div className="fluid-scene absolute inset-0" aria-hidden="true">
      <Canvas camera={{ position: [0, 0, 7.1], fov: 34 }} dpr={[1.2, 2]} gl={{ alpha: true, antialias: true }}>
        <HeroLightRig pointer={pointer} isDark={isDark} />
        <HiveField
          pointer={pointer}
          isDark={isDark}
          planeSize={[8.8, 8.8]}
          position={[0.8, 0.08, -3.3]}
          scale={4.9}
          opacity={isDark ? 0.35 : 0.86}
          brightness={isDark ? 0.4 : 1.24}
          drift={[0.34, 0.18]}
          bias={[0.38, 0.02]}
        />
        <HeroDust pointer={pointer} isDark={isDark} />
        <SignalRibbon pointer={pointer} isDark={isDark} />
        <OrbitStack pointer={pointer} isDark={isDark} />
        <RelayCore pointer={pointer} isDark={isDark} />
      </Canvas>
    </div>
  );
}
