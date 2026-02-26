import * as THREE from 'three';

// --- GAME STATE ---
let score = 0;
let targetScore = 2000;
let timeLeft = 60;
let gameState = 'playing'; // 'playing', 'clear', 'over'
let lastTick = Date.now();

// --- SCENE SETUP ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2a2a2a); // Dark asphalt-ish background

// --- RENDERER SETUP ---
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.autoClear = false; // We will handle clearing for multiple viewports
document.getElementById('app').appendChild(renderer.domElement);

// --- CAMERAS ---
// 1. Main Camera (Top-down perspective)
const mainCamera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
mainCamera.position.set(0, 75, 35); // Elevated higher to see the grid
mainCamera.lookAt(0, 0, 0);

// 2. Minimap Camera (Orthographic, pure top-down)
const minimapSize = 200; // Match CSS size
const viewSize = 160; // Expanded to show the whole area including spawn points
const aspectRatio = minimapSize / minimapSize;
const minimapCamera = new THREE.OrthographicCamera(
    -viewSize * aspectRatio / 2, viewSize * aspectRatio / 2,
    viewSize / 2, -viewSize / 2,
    0.1, 100
);
minimapCamera.position.set(0, 50, 0);
minimapCamera.lookAt(0, 0, 0);
minimapCamera.layers.enable(1); // Enable layer 1 so minimap camera can see blips

// --- LIGHTS ---
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(10, 20, 10);
directionalLight.castShadow = true;
scene.add(directionalLight);

// --- ENVIRONMENT (Intersection Grid) ---
const roadWidthV = 16;
const roadWidthH = 24;
const gridSpacing = 20; // Distance from center for each road
const roadLength = 120;
const roadMaterial = new THREE.MeshStandardMaterial({ color: 0x444444 });

// 2 Horizontal Roads (Top, Bottom)
// They use roadWidthH for their depth
const roadHTop = new THREE.Mesh(new THREE.BoxGeometry(roadLength, 0.5, roadWidthH), roadMaterial);
roadHTop.position.set(0, -0.25, -gridSpacing);
scene.add(roadHTop);

const roadHBot = new THREE.Mesh(new THREE.BoxGeometry(roadLength, 0.5, roadWidthH), roadMaterial);
roadHBot.position.set(0, -0.25, gridSpacing);
scene.add(roadHBot);

// 2 Vertical Roads (Left, Right)
// They use roadWidthV for their width
const roadVLeft = new THREE.Mesh(new THREE.BoxGeometry(roadWidthV, 0.5, roadLength), roadMaterial);
roadVLeft.position.set(-gridSpacing, -0.24, 0);
scene.add(roadVLeft);

const roadVRight = new THREE.Mesh(new THREE.BoxGeometry(roadWidthV, 0.5, roadLength), roadMaterial);
roadVRight.position.set(gridSpacing, -0.24, 0);
scene.add(roadVRight);

// Intersection Squares
const intersectionCenters = [
    { x: -gridSpacing, z: -gridSpacing }, // Top-Left
    { x: gridSpacing, z: -gridSpacing },  // Top-Right
    { x: -gridSpacing, z: gridSpacing },  // Bottom-Left
    { x: gridSpacing, z: gridSpacing }    // Bottom-Right
];

intersectionCenters.forEach(center => {
    // Intersections are now rectangles: roadWidthV wide, roadWidthH deep
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(roadWidthV, 0.5, roadWidthH), new THREE.MeshStandardMaterial({ color: 0x555555 }));
    mesh.position.set(center.x, -0.23, center.z);
    scene.add(mesh);
});

// --- TRAFFIC LIGHTS ---
const trafficLights = [];

// Helper to create a single traffic light per intersection
function createTrafficLight(x, z) {
    const group = new THREE.Group();
    // Position at the top-right corner of the intersection slightly offset
    group.position.set(x + roadWidthV / 2 + 1, 0.5, z - roadWidthH / 2 - 1);

    // Default state: Horizontal cars can go (Blue), Vertical cars stop (Red)
    group.userData = { horizontalBlue: true };

    // Visual Mesh (the light box)
    const visualGeom = new THREE.BoxGeometry(1.5, 2, 1.5);
    const visualMat = new THREE.MeshStandardMaterial({ color: 0x0088ff }); // Start Blue (horizontal go)
    const visualMesh = new THREE.Mesh(visualGeom, visualMat);
    group.add(visualMesh);
    group.userData.visualMat = visualMat;

    // Hitbox Mesh (invisible, larger for easy clicking)
    const hitboxGeom = new THREE.BoxGeometry(6, 6, 6);
    const hitboxMat = new THREE.MeshBasicMaterial({ visible: false });
    const hitboxMesh = new THREE.Mesh(hitboxGeom, hitboxMat);
    // Mark it as interactable
    hitboxMesh.userData = { isHitbox: true, parentLight: group };
    group.add(hitboxMesh);

    scene.add(group);
    trafficLights.push(group);

    return group;
}

const hitboxes = [];
// Create 4 traffic lights, one for each intersection
const tlTopLeft = createTrafficLight(-gridSpacing, -gridSpacing);
const tlTopRight = createTrafficLight(gridSpacing, -gridSpacing);
const tlBotLeft = createTrafficLight(-gridSpacing, gridSpacing);
const tlBotRight = createTrafficLight(gridSpacing, gridSpacing);

// Collect hitboxes
trafficLights.forEach(light => {
    hitboxes.push(light.children[1]);
});

// --- INTERACTION (Raycaster) ---
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

window.addEventListener('pointerdown', (event) => {
    if (gameState !== 'playing') return;

    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, mainCamera);
    const intersects = raycaster.intersectObjects(hitboxes);

    if (intersects.length > 0) {
        const lightGroup = intersects[0].object.userData.parentLight;

        // Toggle state
        lightGroup.userData.horizontalBlue = !lightGroup.userData.horizontalBlue;

        // Update color to reflect horizontal state
        if (lightGroup.userData.horizontalBlue) {
            lightGroup.userData.visualMat.color.setHex(0x0088ff); // Blue
        } else {
            lightGroup.userData.visualMat.color.setHex(0xff0000); // Red
        }
    }
});

// --- VEHICLES ---
// --- VEHICLES ---
const vehicles = [];
const spawnDist = 70; // Spawn distance (edge of the screen map)
const speed = 0.2; // Vehicle speed (slowed down from 0.3)


// 8 Spawners: 2 ends for each of the 4 roads.
// 'route' defines the axis ('x' or 'z'), fixed coord ('z' or 'x'), and direction (-1 or +1)
// We use road widths to center the cars in the appropriate lanes.
const spawners = [
    // --- Vertical Roads (Movement along Z axis) ---
    // Left vertical road
    { pos: new THREE.Vector3(-gridSpacing + roadWidthV / 4, 0.5, -spawnDist), moveAxis: 'z', dir: 1 },  // From Top going Down
    { pos: new THREE.Vector3(-gridSpacing - roadWidthV / 4, 0.5, spawnDist), moveAxis: 'z', dir: -1 }, // From Bot going Up
    // Right vertical road
    { pos: new THREE.Vector3(gridSpacing + roadWidthV / 4, 0.5, -spawnDist), moveAxis: 'z', dir: 1 },   // From Top going Down
    { pos: new THREE.Vector3(gridSpacing - roadWidthV / 4, 0.5, spawnDist), moveAxis: 'z', dir: -1 },  // From Bot going Up

    // --- Horizontal Roads (Movement along X axis) ---
    // Top horizontal road
    { pos: new THREE.Vector3(-spawnDist, 0.5, -gridSpacing - roadWidthH / 4), moveAxis: 'x', dir: 1 },  // From Left going Right
    { pos: new THREE.Vector3(spawnDist, 0.5, -gridSpacing + roadWidthH / 4), moveAxis: 'x', dir: -1 }, // From Right going Left
    // Bottom horizontal road
    { pos: new THREE.Vector3(-spawnDist, 0.5, gridSpacing - roadWidthH / 4), moveAxis: 'x', dir: 1 },   // From Left going Right
    { pos: new THREE.Vector3(spawnDist, 0.5, gridSpacing + roadWidthH / 4), moveAxis: 'x', dir: -1 }   // From Right going Left
];

function spawnVehicle() {
    const spawner = spawners[Math.floor(Math.random() * spawners.length)];

    const vehicleGroup = new THREE.Group();
    vehicleGroup.position.copy(spawner.pos);

    // Main mesh
    const geom = new THREE.BoxGeometry(2, 1, 4);
    if (spawner.moveAxis === 'x') {
        geom.rotateY(Math.PI / 2);
    }
    const color = new THREE.Color().setHSL(Math.random(), 0.8, 0.5);
    const mat = new THREE.MeshStandardMaterial({ color: color });
    const mesh = new THREE.Mesh(geom, mat);
    vehicleGroup.add(mesh);

    // Minimap blip
    const blipGeom = new THREE.BoxGeometry(4, 1, 4);
    const blipMat = new THREE.MeshBasicMaterial({ color: color });
    const blipMesh = new THREE.Mesh(blipGeom, blipMat);
    blipMesh.position.y = 10;
    blipMesh.layers.set(1); // Set to layer 1 so main camera hides it
    vehicleGroup.add(blipMesh);

    vehicleGroup.userData = {
        axis: spawner.moveAxis,
        dir: spawner.dir,
        // Calculate the specific intersections this vehicle will pass
        checkLights: [], // filled in a moment
        passedLights: 0
    };

    // Figure out which traffic lights this spawner will encounter based on lane
    // Each vehicle passes 2 intersections.
    if (spawner.moveAxis === 'z') {
        // Vertical road traversing horizontal roads (so we cross roadWidthH)
        let firstLightZ = (spawner.dir > 0) ? -gridSpacing : gridSpacing;
        let secondLightZ = (spawner.dir > 0) ? gridSpacing : -gridSpacing;

        // Find the light object for this specific x intersection
        let x = vehicleGroup.position.x > 0 ? gridSpacing : -gridSpacing;

        // Stop line is half the horizontal road width + a buffer
        let stopDist = (roadWidthH / 2) + 2;

        let tlX = x + roadWidthV / 2 + 1;
        let tlZ1 = firstLightZ - roadWidthH / 2 - 1;
        let tlZ2 = secondLightZ - roadWidthH / 2 - 1;

        vehicleGroup.userData.checkLights.push({
            light: trafficLights.find(l => Math.abs(l.position.x - tlX) < 5 && Math.abs(l.position.z - tlZ1) < 5),
            stopLine: firstLightZ - (stopDist * spawner.dir)
            // Intersection center for intersection hit detection 
        });
        vehicleGroup.userData.checkLights[0].intersectionCenter = firstLightZ;

        vehicleGroup.userData.checkLights.push({
            light: trafficLights.find(l => Math.abs(l.position.x - tlX) < 5 && Math.abs(l.position.z - tlZ2) < 5),
            stopLine: secondLightZ - (stopDist * spawner.dir)
        });
        vehicleGroup.userData.checkLights[1].intersectionCenter = secondLightZ;

    } else {
        // Horizontal road traversing vertical roads (so we cross roadWidthV)
        let firstLightX = (spawner.dir > 0) ? -gridSpacing : gridSpacing;
        let secondLightX = (spawner.dir > 0) ? gridSpacing : -gridSpacing;

        let z = vehicleGroup.position.z > 0 ? gridSpacing : -gridSpacing;

        let stopDist = (roadWidthV / 2) + 2;

        let tlZ = z - roadWidthH / 2 - 1;
        let tlX1 = firstLightX + roadWidthV / 2 + 1;
        let tlX2 = secondLightX + roadWidthV / 2 + 1;

        vehicleGroup.userData.checkLights.push({
            light: trafficLights.find(l => Math.abs(l.position.z - tlZ) < 5 && Math.abs(l.position.x - tlX1) < 5),
            stopLine: firstLightX - (stopDist * spawner.dir)
        });
        vehicleGroup.userData.checkLights[0].intersectionCenter = firstLightX;

        vehicleGroup.userData.checkLights.push({
            light: trafficLights.find(l => Math.abs(l.position.z - tlZ) < 5 && Math.abs(l.position.x - tlX2) < 5),
            stopLine: secondLightX - (stopDist * spawner.dir)
        });
        vehicleGroup.userData.checkLights[1].intersectionCenter = secondLightX;
    }

    scene.add(vehicleGroup);
    vehicles.push(vehicleGroup);
}

// Spawn a car regularly
setInterval(() => {
    if (gameState === 'playing' && vehicles.length < 60) {
        spawnVehicle();
    }
}, 800);



// --- EXPLOSIONS & EFFECTS ---
const particleGeom = new THREE.BoxGeometry(1.5, 1.5, 1.5);
const explosions = [];
let shakeTime = 0;

function createExplosion(position) {
    // 3D Particles
    for (let i = 0; i < 15; i++) {
        const particleMat = new THREE.MeshBasicMaterial({ color: 0xff4400, transparent: true, opacity: 1 });
        const mesh = new THREE.Mesh(particleGeom, particleMat);
        mesh.position.copy(position);
        mesh.position.y += 1; // Start slightly above ground
        mesh.userData = {
            velocity: new THREE.Vector3(
                (Math.random() - 0.5) * 4,
                Math.random() * 4,
                (Math.random() - 0.5) * 4
            ),
            rotSpeed: new THREE.Vector3(
                Math.random() * 0.4,
                Math.random() * 0.4,
                Math.random() * 0.4
            ),
            life: 1.0
        };
        scene.add(mesh);
        explosions.push(mesh);
    }

    // Flash effect
    const light = new THREE.PointLight(0xffaa00, 5, 100);
    light.position.copy(position);
    light.position.y += 5;
    scene.add(light);
    light.userData = { life: 1.0, isLight: true };
    explosions.push(light);

    // Screen Shake
    shakeTime = 15;

    // DOM Text
    showFloatingText(position, "CRASH! +100");
}

function updateExplosions() {
    for (let i = explosions.length - 1; i >= 0; i--) {
        const obj = explosions[i];
        obj.userData.life -= 0.02;

        if (obj.userData.life <= 0) {
            if (!obj.userData.isLight) {
                obj.material.dispose();
            }
            scene.remove(obj);
            explosions.splice(i, 1);
        } else {
            if (!obj.userData.isLight) {
                obj.position.add(obj.userData.velocity);
                obj.rotation.x += obj.userData.rotSpeed.x;
                obj.rotation.y += obj.userData.rotSpeed.y;
                obj.rotation.z += obj.userData.rotSpeed.z;

                // Color fades from fire to smoke
                obj.material.color.lerpColors(new THREE.Color(0x222222), new THREE.Color(0xff4400), obj.userData.life);
                obj.material.opacity = obj.userData.life;

                // Gravity
                obj.userData.velocity.y -= 0.15;
                // Floor collision
                if (obj.position.y < 0.75) {
                    obj.position.y = 0.75;
                    obj.userData.velocity.y *= -0.5;
                    obj.userData.velocity.x *= 0.8;
                    obj.userData.velocity.z *= 0.8;
                }
            } else {
                obj.intensity = obj.userData.life * 8;
            }
        }
    }
}

function showFloatingText(position, text) {
    const vector = position.clone();
    vector.project(mainCamera);

    const x = (vector.x * 0.5 + 0.5) * window.innerWidth;
    const y = (vector.y * -0.5 + 0.5) * window.innerHeight;

    const el = document.createElement('div');
    el.className = 'floating-text';
    el.innerText = text;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    document.body.appendChild(el);

    setTimeout(() => {
        el.remove();
    }, 1000);
}

// --- RENDER LOOP ---
function animate() {
    requestAnimationFrame(animate);

    if (gameState === 'playing') {
        const now = Date.now();
        if (now - lastTick >= 1000) {
            timeLeft--;
            const timeValueEl = document.getElementById('time-value');
            if (timeValueEl) timeValueEl.innerText = timeLeft;
            lastTick = now;

            if (timeLeft <= 0) {
                gameState = score >= targetScore ? 'clear' : 'over';
                showResult();
            }
        }
    }

    // --- LOGIC UPDATES ---
    if (gameState === 'playing') {
        // Move vehicles
        for (let i = vehicles.length - 1; i >= 0; i--) {
            const v = vehicles[i];
            const data = v.userData;
            const currentPos = v.position[data.axis];

            let shouldStop = false;

            // Find the next intersection the vehicle is approaching
            if (data.passedLights < data.checkLights.length) {
                const nextLightData = data.checkLights[data.passedLights];
                const distToStop = (nextLightData.stopLine - currentPos) * data.dir;

                // Re-evaluate if past the intersection center to increment passedLights
                const intersectionCenter = nextLightData.intersectionCenter;
                if ((currentPos - intersectionCenter) * data.dir > 0) {
                    data.passedLights++;
                } else {
                    // If approaching the stop line
                    const isHorizontal = data.axis === 'x';
                    const lightIsBlueForUs = isHorizontal ? nextLightData.light.userData.horizontalBlue : !nextLightData.light.userData.horizontalBlue;

                    // If the light is red for this lane
                    if (!lightIsBlueForUs) {
                        if (distToStop > 0 && distToStop < speed * 2) {
                            shouldStop = true;
                        }
                    }
                }
            }

            // Avoid rear-ending cars in the same lane
            if (!shouldStop) {
                let vehicleAheadDistance = Infinity;
                for (let j = 0; j < vehicles.length; j++) {
                    if (i === j) continue;
                    const vB = vehicles[j];
                    const dataB = vB.userData;

                    // Check same axis and same direction
                    if (data.axis === dataB.axis && data.dir === dataB.dir) {
                        const orthoAxis = data.axis === 'x' ? 'z' : 'x';
                        // Check if in the same lane (using a small tolerance)
                        if (Math.abs(v.position[orthoAxis] - vB.position[orthoAxis]) < 1) {
                            const dist = (vB.position[data.axis] - currentPos) * data.dir;
                            // If vB is physically ahead and closer than the closest found so far
                            if (dist > 0 && dist < vehicleAheadDistance) {
                                vehicleAheadDistance = dist;
                            }
                        }
                    }
                }
                // Vehicle length is 4 units. Gap is 1 unit.
                if (vehicleAheadDistance < 5) {
                    shouldStop = true;
                }
            }

            if (!shouldStop) {
                v.position[data.axis] += speed * data.dir;
            }

            // Cleanup if out of bounds
            if (Math.abs(v.position[data.axis]) > spawnDist + 10) {
                scene.remove(v);
                vehicles.splice(i, 1);
            }
        }

        // Collision Check (O(N^2) but N < 60 so it's fine)
        const boxA = new THREE.Box3();
        const boxB = new THREE.Box3();

        // We iterate backwards because we might remove elements during the loop
        for (let i = vehicles.length - 1; i >= 0; i--) {
            const vA = vehicles[i];
            if (!vA.userData.active) vA.userData.active = true; // flag to prevent double processing

            boxA.setFromObject(vA);

            for (let j = i - 1; j >= 0; j--) {
                const vB = vehicles[j];
                if (!vB.userData.active) continue;

                boxB.setFromObject(vB);

                if (boxA.intersectsBox(boxB)) {
                    // Collision!
                    // 1. Remove both from scene
                    scene.remove(vA);
                    scene.remove(vB);

                    // 2. Mark inactive so they aren't processed again this frame
                    vA.userData.active = false;
                    vB.userData.active = false;

                    // 3. Remove from array (safely since we iterate backwards)
                    // vA is at i, vB is at j (j < i)
                    vehicles.splice(i, 1);
                    vehicles.splice(j, 1);

                    // 4. Update Score
                    score += 100;
                    document.getElementById('score-value').innerText = score;

                    // 5. Explosion Effect
                    const midpoint = vA.position.clone().lerp(vB.position, 0.5);
                    createExplosion(midpoint);

                    // Break inner loop since vA is destroyed and can't hit anything else
                    break;
                }
            }
        } // End collision check loops

    } // End if (gameState === 'playing')

    updateExplosions();

    // Camera shake effect
    if (shakeTime > 0) {
        const magnitude = (shakeTime / 15) * 1.5;
        mainCamera.position.x = 0 + (Math.random() - 0.5) * magnitude;
        mainCamera.position.y = 75 + (Math.random() - 0.5) * magnitude;
        mainCamera.position.z = 35 + (Math.random() - 0.5) * magnitude;
        shakeTime--;
    } else {
        mainCamera.position.set(0, 75, 35);
    }
    mainCamera.lookAt(0, 0, 0);

    // 1. Render Main Scene
    renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
    renderer.setScissor(0, 0, window.innerWidth, window.innerHeight);
    renderer.setScissorTest(true);
    // Render from perspective camera
    renderer.render(scene, mainCamera);

    // 2. Render Minimap
    const minimapDiv = document.getElementById('minimap');
    if (minimapDiv) {
        // Get minimap container's bounding rectangle to know where to render
        const rect = minimapDiv.getBoundingClientRect();

        // Convert screen coords to WebGL viewport coords (y is inverted)
        const vX = rect.left;
        const vY = window.innerHeight - rect.bottom;
        const vW = rect.width;
        const vH = rect.height;

        renderer.setViewport(vX, vY, vW, vH);
        renderer.setScissor(vX, vY, vW, vH);
        renderer.setScissorTest(true);
        // We can use clearDepth if we don't want to clear color, 
        // but here clear it completely to ensure clean minimap bg
        renderer.clear();
        renderer.render(scene, minimapCamera);
    }
}

// Handle window resize
window.addEventListener('resize', () => {
    mainCamera.aspect = window.innerWidth / window.innerHeight;
    mainCamera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Start loop
animate();

function showResult() {
    const resultScreenEl = document.getElementById('result-screen');
    const resultTitleEl = document.getElementById('result-title');
    const resultScoreEl = document.getElementById('result-score');

    if (resultScreenEl) {
        resultScreenEl.classList.remove('hidden');
        if (resultScoreEl) resultScoreEl.innerText = `Final Score: ${score}`;
        if (resultTitleEl) {
            if (gameState === 'clear') {
                resultTitleEl.innerText = 'MISSION CLEARED!';
                resultTitleEl.style.color = '#4CAF50';
            } else {
                resultTitleEl.innerText = 'TIME UP...';
                resultTitleEl.style.color = '#F44336';
            }
        }
    }
}

const restartBtn = document.getElementById('restart-button');
if (restartBtn) {
    restartBtn.addEventListener('click', () => {
        score = 0;
        timeLeft = 60;
        gameState = 'playing';
        lastTick = Date.now();

        const scoreValueEl = document.getElementById('score-value');
        const timeValueEl = document.getElementById('time-value');
        const resultScreenEl = document.getElementById('result-screen');

        if (scoreValueEl) scoreValueEl.innerText = score;
        if (timeValueEl) timeValueEl.innerText = timeLeft;
        if (resultScreenEl) resultScreenEl.classList.add('hidden');

        // Clear vehicles
        vehicles.forEach(v => scene.remove(v));
        vehicles.length = 0;

        // Clear explosions
        explosions.forEach(e => {
            if (!e.userData.isLight && e.material) e.material.dispose();
            scene.remove(e);
        });
        explosions.length = 0;

        // Reset traffic lights
        trafficLights.forEach(lightGroup => {
            lightGroup.userData.horizontalBlue = true;
            lightGroup.userData.visualMat.color.setHex(0x0088ff);
        });
    });
}
