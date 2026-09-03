import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useTheme } from '../../context/ThemeContext';

export const Train3DCanvas: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { theme } = useTheme();

  useEffect(() => {
    if (!containerRef.current) return;

    // 1. Scene Setup
    const scene = new THREE.Scene();
    const isLight = theme === 'light';

    // Camera
    const camera = new THREE.PerspectiveCamera(
      45,
      containerRef.current.clientWidth / containerRef.current.clientHeight,
      0.1,
      1000
    );
    camera.position.set(12, 8, 16);

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = isLight ? 1.6 : 1.2;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    containerRef.current.appendChild(renderer.domElement);

    // 2. Lighting System (Adaptive to Theme)
    const ambientLight = new THREE.AmbientLight(isLight ? 0xffffff : 0x1a2634, isLight ? 2.0 : 1.2);
    scene.add(ambientLight);

    // Key Light (Amber Studio Glow)
    const keyLight = new THREE.DirectionalLight(0xE8A33D, isLight ? 2.8 : 3.0);
    keyLight.position.set(15, 20, 10);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    scene.add(keyLight);

    // Rim Light (Steel Blue)
    const rimLight = new THREE.DirectionalLight(0x3E6C8A, isLight ? 2.2 : 2.2);
    rimLight.position.set(-15, 10, -10);
    scene.add(rimLight);

    // Green Signal Point Light
    const signalLight = new THREE.PointLight(0x2E8B57, 2.5, 25);
    signalLight.position.set(0, 5, 2);
    scene.add(signalLight);

    // 3. Curved Railway Track Ribbon
    const curvePoints = [
      new THREE.Vector3(-18, -4, -12),
      new THREE.Vector3(-10, -1.5, -4),
      new THREE.Vector3(-3, 0.5, 2),
      new THREE.Vector3(4, 1.2, 4),
      new THREE.Vector3(12, 0.2, 0),
      new THREE.Vector3(18, -2, -8),
    ];
    const trackCurve = new THREE.CatmullRomCurve3(curvePoints);

    // Dual Steel Rail Tubes
    const railMat = new THREE.MeshStandardMaterial({
      color: isLight ? 0x64748B : 0xCBD5E1,
      metalness: 0.9,
      roughness: 0.2,
    });

    const railOffset = 0.5;
    const railPoints1: THREE.Vector3[] = [];
    const railPoints2: THREE.Vector3[] = [];
    const numSamples = 120;

    for (let i = 0; i <= numSamples; i++) {
      const t = i / numSamples;
      const pt = trackCurve.getPoint(t);
      const tangent = trackCurve.getTangent(t);
      const normal = new THREE.Vector3(0, 1, 0).cross(tangent).normalize();

      railPoints1.push(pt.clone().add(normal.clone().multiplyScalar(railOffset)));
      railPoints2.push(pt.clone().add(normal.clone().multiplyScalar(-railOffset)));
    }

    const railCurve1 = new THREE.CatmullRomCurve3(railPoints1);
    const railCurve2 = new THREE.CatmullRomCurve3(railPoints2);

    const railGeo1 = new THREE.TubeGeometry(railCurve1, 100, 0.08, 8, false);
    const railGeo2 = new THREE.TubeGeometry(railCurve2, 100, 0.08, 8, false);

    const railMesh1 = new THREE.Mesh(railGeo1, railMat);
    const railMesh2 = new THREE.Mesh(railGeo2, railMat);
    scene.add(railMesh1);
    scene.add(railMesh2);

    // Sleepers / Concrete Ties along track
    const sleeperMat = new THREE.MeshStandardMaterial({
      color: isLight ? 0x94A3B8 : 0x1E293B,
      roughness: 0.7,
      metalness: 0.1,
    });
    const sleeperGeo = new THREE.BoxGeometry(1.4, 0.08, 0.25);

    for (let i = 0; i < 50; i++) {
      const t = i / 50;
      const pt = trackCurve.getPoint(t);
      const tangent = trackCurve.getTangent(t);

      const sleeper = new THREE.Mesh(sleeperGeo, sleeperMat);
      sleeper.position.copy(pt).sub(new THREE.Vector3(0, 0.05, 0));
      sleeper.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tangent);
      scene.add(sleeper);
    }

    // 4. Overhead Catenary Mast Portals & 25kV OHE Wire
    const mastMat = new THREE.MeshStandardMaterial({
      color: isLight ? 0x64748B : 0x334155,
      metalness: 0.7,
      roughness: 0.3,
    });

    const oheWirePoints: THREE.Vector3[] = [];
    for (let i = 0; i <= numSamples; i++) {
      const t = i / numSamples;
      const pt = trackCurve.getPoint(t);
      oheWirePoints.push(pt.clone().add(new THREE.Vector3(0, 2.2, 0)));
    }
    const oheWireCurve = new THREE.CatmullRomCurve3(oheWirePoints);
    const oheWireGeo = new THREE.TubeGeometry(oheWireCurve, 80, 0.02, 6, false);
    const oheWireMat = new THREE.MeshBasicMaterial({ color: 0xE8A33D });
    const oheWireMesh = new THREE.Mesh(oheWireGeo, oheWireMat);
    scene.add(oheWireMesh);

    // Add 4 Mast Portals along the track
    for (const t of [0.15, 0.4, 0.65, 0.9]) {
      const pt = trackCurve.getPoint(t);
      const tangent = trackCurve.getTangent(t);
      const normal = new THREE.Vector3(0, 1, 0).cross(tangent).normalize();

      const mastGroup = new THREE.Group();
      
      // Vertical pillars
      const pillarGeo = new THREE.CylinderGeometry(0.06, 0.06, 2.6, 8);
      const p1 = new THREE.Mesh(pillarGeo, mastMat);
      p1.position.copy(normal.clone().multiplyScalar(1.2)).add(new THREE.Vector3(0, 1.3, 0));
      const p2 = new THREE.Mesh(pillarGeo, mastMat);
      p2.position.copy(normal.clone().multiplyScalar(-1.2)).add(new THREE.Vector3(0, 1.3, 0));

      // Cross beam
      const beamGeo = new THREE.BoxGeometry(2.5, 0.08, 0.08);
      const beam = new THREE.Mesh(beamGeo, mastMat);
      beam.position.set(0, 2.3, 0);

      // Signal aspect light on mast
      const aspectGeo = new THREE.SphereGeometry(0.12, 16, 16);
      const aspectMat = new THREE.MeshBasicMaterial({ color: 0x2E8B57 });
      const aspect = new THREE.Mesh(aspectGeo, aspectMat);
      aspect.position.set(0.8, 2.1, 0);

      mastGroup.add(p1);
      mastGroup.add(p2);
      mastGroup.add(beam);
      mastGroup.add(aspect);

      mastGroup.position.copy(pt);
      mastGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tangent);
      scene.add(mastGroup);
    }

    // 5. Sleek Aerodynamic 3D Bullet Train (Locomotive + Coach)
    const trainGroup = new THREE.Group();

    // Locomotive Body (Glossy Streamlined Ceramic / Navy Carbon)
    const locoMat = new THREE.MeshPhysicalMaterial({
      color: isLight ? 0x334155 : 0x0B1420,
      metalness: 0.3,
      roughness: 0.1,
      clearcoat: 1.0,
      clearcoatRoughness: 0.1,
      reflectivity: 0.9,
    });

    const locoGeo = new THREE.BoxGeometry(1.1, 0.9, 3.2);
    const locomotive = new THREE.Mesh(locoGeo, locoMat);
    locomotive.position.set(0, 0.6, 0);
    locomotive.castShadow = true;
    trainGroup.add(locomotive);

    // Streamlined Nose Cone
    const noseGeo = new THREE.ConeGeometry(0.65, 1.4, 32);
    noseGeo.rotateX(Math.PI / 2);
    const nose = new THREE.Mesh(noseGeo, locoMat);
    nose.position.set(0, 0.55, 2.0);
    trainGroup.add(nose);

    // Amber Golden Speed Stripe
    const stripeMat = new THREE.MeshBasicMaterial({ color: 0xE8A33D });
    const stripeGeo = new THREE.BoxGeometry(1.14, 0.1, 3.0);
    const stripe = new THREE.Mesh(stripeGeo, stripeMat);
    stripe.position.set(0, 0.6, 0.1);
    trainGroup.add(stripe);

    // Cockpit Tinted Visor
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0x05070C,
      transmission: 0.4,
      roughness: 0.05,
      metalness: 0.9,
    });
    const visorGeo = new THREE.BoxGeometry(0.9, 0.35, 0.8);
    const visor = new THREE.Mesh(visorGeo, glassMat);
    visor.position.set(0, 0.75, 1.4);
    trainGroup.add(visor);

    // Twin High-Intensity LED Headlights
    const lightMat = new THREE.MeshBasicMaterial({ color: 0xFFF5E0 });
    const hlGeo = new THREE.SphereGeometry(0.1, 16, 16);
    const hl1 = new THREE.Mesh(hlGeo, lightMat);
    hl1.position.set(-0.35, 0.4, 2.5);
    const hl2 = new THREE.Mesh(hlGeo, lightMat);
    hl2.position.set(0.35, 0.4, 2.5);
    trainGroup.add(hl1);
    trainGroup.add(hl2);

    // Headlight Photon Beam
    const beamConeGeo = new THREE.ConeGeometry(0.9, 4.0, 32, 1, true);
    beamConeGeo.rotateX(Math.PI / 2);
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xE8A33D,
      transparent: true,
      opacity: 0.25,
      side: THREE.DoubleSide,
    });
    const headlightBeam = new THREE.Mesh(beamConeGeo, beamMat);
    headlightBeam.position.set(0, 0.4, 4.2);
    trainGroup.add(headlightBeam);

    // Pantograph (OHE Power Collector)
    const pantoMat = new THREE.MeshStandardMaterial({ color: 0xE8A33D, metalness: 0.8, roughness: 0.2 });
    const pantoArm1 = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.8), pantoMat);
    pantoArm1.position.set(0, 1.3, -0.6);
    pantoArm1.rotation.x = Math.PI / 4;
    const pantoHead = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.04, 0.1), pantoMat);
    pantoHead.position.set(0, 1.6, -0.3);
    trainGroup.add(pantoArm1);
    trainGroup.add(pantoHead);

    scene.add(trainGroup);

    // 6. Animation Loop
    let trainProgress = 0.2;
    let clock = new THREE.Clock();
    let frameId: number;

    // Mouse Parallax Interaction
    let mouseX = 0;
    let mouseY = 0;
    const handleMouseMove = (e: MouseEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      mouseX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouseY = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
    };

    window.addEventListener('mousemove', handleMouseMove);

    const animate = () => {
      frameId = requestAnimationFrame(animate);
      const delta = clock.getDelta();

      // Move train smoothly along track ribbon
      trainProgress = (trainProgress + delta * 0.08) % 1.0;

      const currentPos = trackCurve.getPoint(trainProgress);
      const tangent = trackCurve.getTangent(trainProgress);

      trainGroup.position.copy(currentPos);
      trainGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tangent);

      // Subtle gentle banking
      trainGroup.rotateZ(Math.sin(trainProgress * Math.PI * 4) * 0.08);

      // Mouse camera parallax
      camera.position.x += (12 + mouseX * 2.5 - camera.position.x) * 0.04;
      camera.position.y += (8 + mouseY * 1.5 - camera.position.y) * 0.04;
      camera.lookAt(0, 1, 0);

      renderer.render(scene, camera);
    };

    animate();

    // 7. Resize Handler
    const handleResize = () => {
      if (!containerRef.current) return;
      const width = containerRef.current.clientWidth;
      const height = containerRef.current.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
      if (containerRef.current && renderer.domElement) {
        containerRef.current.removeChild(renderer.domElement);
      }
    };
  }, [theme]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full relative cursor-grab active:cursor-grabbing select-none"
      title="Interactive 3D Bullet Train & Prayagraj Corridor Simulation"
    />
  );
};
