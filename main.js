import * as THREE from 'three';

// --- GAME STATE ---
let score = 0;
let targetScore = 2000;
let timeLeft = 60;
let gameState = 'playing'; // 'playing', 'clear', 'over'
let lastTick = Date.now();

// --- PLAYER CHARACTER STATE ---
const MAX_HP = 3;
let playerHP = MAX_HP;
let playerInvincible = 0; // Invincibility frames counter
const PLAYER_SPEED = 0.18;
let playerTarget = null; // {x, z} click target
const MAX_BARRICADES = 3;
const barricades = [];

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
mainCamera.position.set(0, 95, 45); // Elevated higher to see the grid
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
const roadWidthV = 20;
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

// --- GROUND PLANES (for click raycasting) ---
const groundPlanes = [];
[roadHTop, roadHBot, roadVLeft, roadVRight].forEach(r => groundPlanes.push(r));
intersectionCenters.forEach((center, idx) => {
    // intersection meshes were already added; reference by re-creating a ground quad
});
// Add a large invisible ground plane for raycasting
const groundPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(300, 300),
    new THREE.MeshBasicMaterial({ visible: false })
);
groundPlane.rotation.x = -Math.PI / 2;
groundPlane.position.y = 0;
scene.add(groundPlane);

// --- PLAYER CHARACTER ---
function createPlayerCharacter() {
    const playerGroup = new THREE.Group();

    // Body
    const bodyGeom = new THREE.BoxGeometry(1.2, 2, 0.8);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xff8800 });
    const body = new THREE.Mesh(bodyGeom, bodyMat);
    body.position.y = 2.5;
    playerGroup.add(body);

    // Head
    const headGeom = new THREE.SphereGeometry(0.5, 8, 8);
    const headMat = new THREE.MeshStandardMaterial({ color: 0xffcc88 });
    const head = new THREE.Mesh(headGeom, headMat);
    head.position.y = 4;
    playerGroup.add(head);

    // Left Leg
    const legGeom = new THREE.BoxGeometry(0.4, 1.2, 0.4);
    const legMat = new THREE.MeshStandardMaterial({ color: 0x3355aa });
    const leftLeg = new THREE.Mesh(legGeom, legMat);
    leftLeg.position.set(-0.3, 1, 0);
    playerGroup.add(leftLeg);

    // Right Leg
    const rightLeg = new THREE.Mesh(legGeom, legMat.clone());
    rightLeg.position.set(0.3, 1, 0);
    playerGroup.add(rightLeg);

    // Left Arm
    const armGeom = new THREE.BoxGeometry(0.3, 1.4, 0.3);
    const armMat = new THREE.MeshStandardMaterial({ color: 0xff8800 });
    const leftArm = new THREE.Mesh(armGeom, armMat);
    leftArm.position.set(-0.75, 2.6, 0);
    playerGroup.add(leftArm);

    // Right Arm
    const rightArm = new THREE.Mesh(armGeom, armMat.clone());
    rightArm.position.set(0.75, 2.6, 0);
    playerGroup.add(rightArm);

    // Minimap blip (large, bright, on layer 1)
    const blipGeom = new THREE.BoxGeometry(6, 1, 6);
    const blipMat = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    const blipMesh = new THREE.Mesh(blipGeom, blipMat);
    blipMesh.position.y = 10;
    blipMesh.layers.set(1);
    playerGroup.add(blipMesh);

    playerGroup.position.set(0, 0, 0); // Start at center
    scene.add(playerGroup);

    return playerGroup;
}

const player = createPlayerCharacter();

// Move target indicator
const targetIndicatorGeom = new THREE.RingGeometry(0.8, 1.2, 16);
const targetIndicatorMat = new THREE.MeshBasicMaterial({ color: 0x00ff88, side: THREE.DoubleSide, transparent: true, opacity: 0.7 });
const targetIndicator = new THREE.Mesh(targetIndicatorGeom, targetIndicatorMat);
targetIndicator.rotation.x = -Math.PI / 2;
targetIndicator.position.y = 0.1;
targetIndicator.visible = false;
scene.add(targetIndicator);

// --- DIRECTION TILES ---
// Each tile slot represents an approach to an intersection from a specific direction.
// Directions: 'fromNorth' (moving +Z, approaching from north), 'fromSouth' (moving -Z),
//             'fromWest' (moving +X), 'fromEast' (moving -X)
const directionTiles = [];
const tileHitboxes = [];

// Color mapping for tile directions
const TILE_COLORS = {
    straight: 0x0088ff, // Blue
    right: 0x00cc66,    // Green
    left: 0xffaa00      // Yellow/Orange
};

// Create arrow shape for visual indicator
function createArrowMesh(direction) {
    const group = new THREE.Group();

    // Arrow shaft
    const shaftGeom = new THREE.BoxGeometry(0.8, 0.3, 2.5);
    const color = TILE_COLORS[direction];
    const shaftMat = new THREE.MeshStandardMaterial({ color: color, emissive: color, emissiveIntensity: 0.3 });
    const shaft = new THREE.Mesh(shaftGeom, shaftMat);
    shaft.position.set(0, 0, -0.3);
    group.add(shaft);

    // Arrow head (triangle using a cone)
    const headGeom = new THREE.ConeGeometry(1.2, 1.5, 3);
    const headMat = new THREE.MeshStandardMaterial({ color: color, emissive: color, emissiveIntensity: 0.3 });
    const head = new THREE.Mesh(headGeom, headMat);
    head.rotation.x = -Math.PI / 2; // Point forward (+Z)
    head.position.set(0, 0, 1.5);
    group.add(head);

    return group;
}

// approachDir: which direction the car is coming FROM (determines rotation of visual)
// 'fromNorth' = car moving +Z (downward on screen)
// 'fromSouth' = car moving -Z (upward on screen)
// 'fromWest'  = car moving +X (rightward)
// 'fromEast'  = car moving -X (leftward)
function createTileSlot(intersectionX, intersectionZ, approachDir) {
    const group = new THREE.Group();

    // Position the tile before the intersection on the approach road,
    // offset to the correct lane where vehicles actually drive.
    let tileX = intersectionX;
    let tileZ = intersectionZ;
    const tileOffset = 15; // Distance from intersection center along approach axis

    switch (approachDir) {
        case 'fromNorth': // Car comes from top, moving +Z (right lane = +roadWidthV/4)
            tileZ = intersectionZ - tileOffset;
            tileX = intersectionX + roadWidthV / 4;
            break;
        case 'fromSouth': // Car comes from bottom, moving -Z (right lane = -roadWidthV/4)
            tileZ = intersectionZ + tileOffset;
            tileX = intersectionX - roadWidthV / 4;
            break;
        case 'fromWest': // Car comes from left, moving +X (right lane = -roadWidthH/4)
            tileX = intersectionX - tileOffset;
            tileZ = intersectionZ - roadWidthH / 4;
            break;
        case 'fromEast': // Car comes from right, moving -X (right lane = +roadWidthH/4)
            tileX = intersectionX + tileOffset;
            tileZ = intersectionZ + roadWidthH / 4;
            break;
    }

    group.position.set(tileX, 0.3, tileZ);

    // Base platform
    const baseGeom = new THREE.BoxGeometry(5, 0.4, 5);
    const baseMat = new THREE.MeshStandardMaterial({
        color: TILE_COLORS.straight,
        transparent: true,
        opacity: 0.6
    });
    const baseMesh = new THREE.Mesh(baseGeom, baseMat);
    group.add(baseMesh);

    // Arrow visual
    const arrowGroup = createArrowMesh('straight');
    arrowGroup.position.y = 0.4;

    // Rotate arrow to match approach direction
    // Arrow points in the "forward" direction for 'straight' 
    switch (approachDir) {
        case 'fromNorth': // moving +Z
            arrowGroup.rotation.y = 0;
            break;
        case 'fromSouth': // moving -Z
            arrowGroup.rotation.y = Math.PI;
            break;
        case 'fromWest': // moving +X
            arrowGroup.rotation.y = Math.PI / 2;
            break;
        case 'fromEast': // moving -X
            arrowGroup.rotation.y = -Math.PI / 2;
            break;
    }

    group.add(arrowGroup);

    // Hitbox (invisible, larger for easy clicking)
    const hitboxGeom = new THREE.BoxGeometry(6, 6, 6);
    const hitboxMat = new THREE.MeshBasicMaterial({ visible: false });
    const hitboxMesh = new THREE.Mesh(hitboxGeom, hitboxMat);
    hitboxMesh.userData = { isTileHitbox: true, parentTile: group };
    group.add(hitboxMesh);
    tileHitboxes.push(hitboxMesh);

    // Store tile data
    group.userData = {
        direction: 'straight', // 'straight', 'right', 'left'
        approachDir: approachDir,
        intersectionX: intersectionX,
        intersectionZ: intersectionZ,
        baseMat: baseMat,
        arrowGroup: arrowGroup,
        baseApproachRotation: arrowGroup.rotation.y // Store base rotation for approach direction
    };

    scene.add(group);
    directionTiles.push(group);

    return group;
}

// Helper: get the rotation offset for the arrow based on tile direction
function getArrowRotationOffset(tileDirection) {
    switch (tileDirection) {
        case 'straight': return 0;
        case 'right': return -Math.PI / 2;  // Turn right
        case 'left': return Math.PI / 2;    // Turn left
    }
    return 0;
}

// Cycle tile direction and update visuals
function cycleTileDirection(tileGroup) {
    const data = tileGroup.userData;
    const cycle = ['straight', 'right', 'left'];
    const currentIdx = cycle.indexOf(data.direction);
    data.direction = cycle[(currentIdx + 1) % cycle.length];

    // Update base color
    data.baseMat.color.setHex(TILE_COLORS[data.direction]);

    // Update arrow: rebuild it with new color and rotation
    tileGroup.remove(data.arrowGroup);
    const newArrow = createArrowMesh(data.direction);
    newArrow.position.y = 0.4;
    newArrow.rotation.y = data.baseApproachRotation + getArrowRotationOffset(data.direction);
    tileGroup.add(newArrow);
    data.arrowGroup = newArrow;
}

// Create all tile slots for all 4 intersections × 4 approach directions
const approachDirs = ['fromNorth', 'fromSouth', 'fromWest', 'fromEast'];
intersectionCenters.forEach(center => {
    approachDirs.forEach(dir => {
        createTileSlot(center.x, center.z, dir);
    });
});

// --- INTERACTION (Raycaster) ---
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

window.addEventListener('pointerdown', (event) => {
    if (gameState !== 'playing') return;

    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, mainCamera);

    // Priority 1: Direction tile hitboxes
    const tileIntersects = raycaster.intersectObjects(tileHitboxes);
    if (tileIntersects.length > 0) {
        const tileGroup = tileIntersects[0].object.userData.parentTile;
        cycleTileDirection(tileGroup);
        return; // Don't move player when clicking a tile
    }

    // Priority 2: Click-to-move on ground
    const groundIntersects = raycaster.intersectObject(groundPlane);
    if (groundIntersects.length > 0) {
        const point = groundIntersects[0].point;
        playerTarget = { x: point.x, z: point.z };

        // Show target indicator
        targetIndicator.position.set(point.x, 0.1, point.z);
        targetIndicator.visible = true;
    }
});

// --- BARRICADE PLACEMENT (E key) ---
window.addEventListener('keydown', (event) => {
    if (gameState !== 'playing') return;

    if (event.key === 'e' || event.key === 'E') {
        placeBarricade();
    }
});

function placeBarricade() {
    // Check if we have slots remaining
    if (barricades.length >= MAX_BARRICADES) {
        // Remove oldest barricade
        const oldest = barricades.shift();
        scene.remove(oldest);
    }

    const barricadeGroup = new THREE.Group();

    // Main body - striped barrier look
    const barGeom = new THREE.BoxGeometry(4, 1.5, 1);
    const barMat = new THREE.MeshStandardMaterial({ color: 0xff3300 });
    const bar = new THREE.Mesh(barGeom, barMat);
    bar.position.y = 0.75;
    barricadeGroup.add(bar);

    // Warning stripe
    const stripeGeom = new THREE.BoxGeometry(4.1, 0.4, 1.1);
    const stripeMat = new THREE.MeshStandardMaterial({ color: 0xffcc00 });
    const stripe = new THREE.Mesh(stripeGeom, stripeMat);
    stripe.position.y = 0.75;
    barricadeGroup.add(stripe);

    // Minimap blip for barricade
    const blipGeom = new THREE.BoxGeometry(4, 1, 4);
    const blipMat = new THREE.MeshBasicMaterial({ color: 0xff3300 });
    const blipMesh = new THREE.Mesh(blipGeom, blipMat);
    blipMesh.position.y = 10;
    blipMesh.layers.set(1);
    barricadeGroup.add(blipMesh);

    barricadeGroup.position.set(player.position.x, 0, player.position.z);
    barricadeGroup.userData = { isBarricade: true };

    scene.add(barricadeGroup);
    barricades.push(barricadeGroup);

    // Update UI
    updateBarricadeUI();
}

function updateBarricadeUI() {
    const el = document.getElementById('barricade-value');
    if (el) el.innerText = MAX_BARRICADES - barricades.length;
}

function updateHPUI() {
    const el = document.getElementById('hp-value');
    if (el) el.innerText = '❤'.repeat(playerHP) + '♡'.repeat(MAX_HP - playerHP);
}

// --- Helper: Find the direction tile for a given intersection and approach ---
function findTileForApproach(intersectionX, intersectionZ, approachDir) {
    return directionTiles.find(t =>
        t.userData.intersectionX === intersectionX &&
        t.userData.intersectionZ === intersectionZ &&
        t.userData.approachDir === approachDir
    );
}

// --- Helper: Determine the approach direction from vehicle axis/dir ---
function getApproachDir(axis, dir) {
    if (axis === 'z' && dir === 1) return 'fromNorth';   // Moving +Z = coming from north
    if (axis === 'z' && dir === -1) return 'fromSouth';  // Moving -Z = coming from south
    if (axis === 'x' && dir === 1) return 'fromWest';    // Moving +X = coming from west
    if (axis === 'x' && dir === -1) return 'fromEast';   // Moving -X = coming from east
    return 'fromNorth';
}

// --- Helper: Convert tile direction to world turn for a given approach ---
function resolveTileDirection(tileDirection, currentAxis, currentDir) {
    if (tileDirection === 'straight') return { axis: currentAxis, dir: currentDir };

    let newAxis, newDir;
    
    // In THREE.js with our camera: +Z is down (screen bottom), -Z is up (screen top)
    // +X is right, -X is left.
    // So if moving +Z (down), a RIGHT turn should go towards -X (driver's right)
    // Wait, screen relative:
    // When a car goes down the screen (+Z), its "right" is the screen's left (-X).
    // Let's make "right" and "left" mean relative to the CAR's forward direction.
    // If moving +Z (down), Right turn -> -X (left on screen). Left turn -> +X (right on screen).
    // Let's check the arrow visuals: getArrowRotationOffset('right') is -Math.PI/2.
    // Base rotation for moving +Z is 0. Arrow points +Z (0).
    // -Math.PI/2 rotates it so it points towards -X (Left on screen). 
    // Yes! Right is -X, Left is +X when moving +Z.
    // So 'right' means clockwise turn in Y-axis! (which is negative rotation)
    // Let's fix this for all 4 approaches to ensure Arrow matches Car.

    if (currentAxis === 'z') {
        newAxis = 'x';
        if (tileDirection === 'right') {
            // Moving +Z (down), turn Right -> go -X (left on screen)
            // Moving -Z (up), turn Right -> go +X (right on screen)
            newDir = currentDir === 1 ? -1 : 1;
        } else { // left
            // Moving +Z (down), turn Left -> go +X (right on screen)
            // Moving -Z (up), turn Left -> go -X (left on screen)
            newDir = currentDir === 1 ? 1 : -1;
        }
    } else {
        newAxis = 'z';
        if (tileDirection === 'right') {
            // Moving +X (right), turn Right -> go +Z (down on screen)
            // Moving -X (left), turn Right -> go -Z (up on screen)
            newDir = currentDir === 1 ? 1 : -1;
        } else { // left
            // Moving +X (right), turn Left -> go -Z (up on screen)
            // Moving -X (left), turn Left -> go +Z (down on screen)
            newDir = currentDir === 1 ? -1 : 1;
        }
    }
    return { axis: newAxis, dir: newDir };
}

// --- VEHICLES ---
const vehicles = [];
const spawnDist = 70; // Spawn distance (edge of the screen map)
const speed = 0.2; // Vehicle speed


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
    const color = new THREE.Color().setHSL(Math.random(), 0.8, 0.5);
    const mat = new THREE.MeshStandardMaterial({ color: color });
    const mesh = new THREE.Mesh(geom, mat);
    vehicleGroup.add(mesh);

    // Standardize rotation so +Z is always forward for the vehicle mesh
    // x axis moves left/right
    if (spawner.moveAxis === 'x') {
        if (spawner.dir === 1) { // Moving +X (Right)
            vehicleGroup.rotation.y = Math.PI / 2;
        } else { // Moving -X (Left)
            vehicleGroup.rotation.y = -Math.PI / 2;
        }
    } else {
        if (spawner.dir === 1) { // Moving +Z (Down on screen)
            vehicleGroup.rotation.y = 0;
        } else { // Moving -Z (Up on screen)
            vehicleGroup.rotation.y = Math.PI;
        }
    }

    // Blinkers (Indicators) at the front corners
    const blinkerGeom = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    const blinkerMat = new THREE.MeshBasicMaterial({ color: 0xffaa00, visible: false }); // Start hidden

    const leftBlinker = new THREE.Mesh(blinkerGeom, blinkerMat.clone());
    // Position front-left relative to vehicle (front is +Z, left is +X)
    leftBlinker.position.set(0.8, 0.2, 1.8);
    vehicleGroup.add(leftBlinker);

    const rightBlinker = new THREE.Mesh(blinkerGeom, blinkerMat.clone());
    // Position front-right relative to vehicle (front is +Z, right is -X)
    rightBlinker.position.set(-0.8, 0.2, 1.8);
    vehicleGroup.add(rightBlinker);

    // Minimap blip
    const blipGeom = new THREE.BoxGeometry(4, 1, 4);
    const blipMat = new THREE.MeshBasicMaterial({ color: color });
    const blipMesh = new THREE.Mesh(blipGeom, blipMat);
    blipMesh.position.y = 10;
    blipMesh.layers.set(1); // Set to layer 1 so main camera hides it
    // Reverse the parent rotation so minimap blip is always axis-aligned 
    // (since vehicleGroup is now rotated)
    blipMesh.rotation.y = -vehicleGroup.rotation.y;
    vehicleGroup.add(blipMesh);

    vehicleGroup.userData = {
        axis: spawner.moveAxis,
        dir: spawner.dir,
        active: true,
        leftBlinker: leftBlinker,
        rightBlinker: rightBlinker,
        // Dynamic pathing: track which intersections we've already passed through
        passedIntersections: [], // [{x, z}] for intersections already handled
        currentTurnAction: null, // null or {action, turnCenter, turnValue, newAxis, newDir}
        isTurning: false
    };

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

// --- PLAYER CHARACTER UPDATE ---
function updatePlayer() {
    if (gameState !== 'playing') return;

    // Move toward target
    if (playerTarget) {
        const dx = playerTarget.x - player.position.x;
        const dz = playerTarget.z - player.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);

        if (dist > 0.5) {
            const mx = (dx / dist) * PLAYER_SPEED;
            const mz = (dz / dist) * PLAYER_SPEED;
            player.position.x += mx;
            player.position.z += mz;

            // Face movement direction
            player.rotation.y = Math.atan2(mx, mz);

            // Simple walk animation: oscillate legs
            const time = Date.now() * 0.008;
            const leftLeg = player.children[2]; // left leg
            const rightLeg = player.children[3]; // right leg
            const leftArm = player.children[4];
            const rightArm = player.children[5];
            if (leftLeg) leftLeg.rotation.x = Math.sin(time) * 0.5;
            if (rightLeg) rightLeg.rotation.x = -Math.sin(time) * 0.5;
            if (leftArm) leftArm.rotation.x = -Math.sin(time) * 0.4;
            if (rightArm) rightArm.rotation.x = Math.sin(time) * 0.4;
        } else {
            playerTarget = null;
            targetIndicator.visible = false;

            // Reset limb rotations
            player.children[2].rotation.x = 0;
            player.children[3].rotation.x = 0;
            player.children[4].rotation.x = 0;
            player.children[5].rotation.x = 0;
        }
    }

    // Invincibility countdown
    if (playerInvincible > 0) {
        playerInvincible--;
        // Blink effect: toggle visibility every 5 frames
        player.visible = (Math.floor(playerInvincible / 5) % 2 === 0);
    } else {
        player.visible = true;
    }

    // Rotate target indicator
    if (targetIndicator.visible) {
        targetIndicator.rotation.z += 0.03;
    }
}

function checkPlayerVehicleCollision() {
    if (gameState !== 'playing' || playerInvincible > 0) return;

    const playerBox = new THREE.Box3();
    // Create a small box around player position
    playerBox.setFromCenterAndSize(
        new THREE.Vector3(player.position.x, 1.5, player.position.z),
        new THREE.Vector3(2, 4, 2)
    );

    const vehicleBox = new THREE.Box3();

    for (let i = vehicles.length - 1; i >= 0; i--) {
        const v = vehicles[i];
        if (!v.userData.active) continue;

        vehicleBox.setFromObject(v);

        if (playerBox.intersectsBox(vehicleBox)) {
            // Player takes damage
            playerHP--;
            updateHPUI();

            // Knockback: push player away from vehicle
            const knockDir = new THREE.Vector3(
                player.position.x - v.position.x,
                0,
                player.position.z - v.position.z
            ).normalize();
            player.position.x += knockDir.x * 5;
            player.position.z += knockDir.z * 5;
            playerTarget = null;
            targetIndicator.visible = false;

            // Set invincibility (about 2 seconds at 60fps)
            playerInvincible = 120;

            // Destroy the vehicle (crash)
            scene.remove(v);
            v.userData.active = false;
            vehicles.splice(i, 1);

            // Explosion effect (no score for self-damage)
            createExplosion(v.position.clone());
            showFloatingText(v.position.clone(), 'OUCH!');

            // Check game over
            if (playerHP <= 0) {
                gameState = 'over';
                showResult();
            }

            break; // Only one collision per frame
        }
    }
}

function checkBarricadeVehicleCollision() {
    if (gameState !== 'playing') return;

    const barricadeBox = new THREE.Box3();
    const vehicleBox = new THREE.Box3();

    for (let bi = barricades.length - 1; bi >= 0; bi--) {
        const b = barricades[bi];
        barricadeBox.setFromCenterAndSize(
            new THREE.Vector3(b.position.x, 0.75, b.position.z),
            new THREE.Vector3(4, 1.5, 1.5)
        );

        for (let vi = vehicles.length - 1; vi >= 0; vi--) {
            const v = vehicles[vi];
            if (!v.userData.active) continue;

            vehicleBox.setFromObject(v);

            if (barricadeBox.intersectsBox(vehicleBox)) {
                // Vehicle crashes into barricade
                score += 100;
                document.getElementById('score-value').innerText = score;

                // Explosion
                const midpoint = v.position.clone().lerp(b.position, 0.3);
                createExplosion(midpoint);
                showFloatingText(midpoint, 'CRASH! +100');

                // Remove vehicle
                scene.remove(v);
                v.userData.active = false;
                vehicles.splice(vi, 1);

                // Remove barricade
                scene.remove(b);
                barricades.splice(bi, 1);
                updateBarricadeUI();

                break; // This barricade is gone, move to next
            }
        }
    }
}

// --- Helper: Find the next intersection ahead for a vehicle ---
function findNextIntersection(vPos, axis, dir, passedIntersections) {
    let candidates = intersectionCenters.filter(c => {
        // Check if already passed
        const alreadyPassed = passedIntersections.some(p => p.x === c.x && p.z === c.z);
        if (alreadyPassed) return false;

        if (axis === 'z') {
            // Vehicle on a vertical road: match x coordinate
            if (Math.abs(c.x - vPos.x) > roadWidthV / 2 + 2) return false;
            const dist = (c.z - vPos.z) * dir;
            return dist > -2; // Must be ahead or at intersection (allow overlap for turn trigger)
        } else {
            // Vehicle on a horizontal road: match z coordinate
            if (Math.abs(c.z - vPos.z) > roadWidthH / 2 + 2) return false;
            const dist = (c.x - vPos.x) * dir;
            return dist > -2; // Must be ahead or at intersection
        }
    });

    if (candidates.length === 0) return null;

    // Sort by distance, pick closest
    candidates.sort((a, b) => {
        const distA = axis === 'z' ? (a.z - vPos.z) * dir : (a.x - vPos.x) * dir;
        const distB = axis === 'z' ? (b.z - vPos.z) * dir : (b.x - vPos.x) * dir;
        return distA - distB;
    });

    return candidates[0];
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
        // Update player
        updatePlayer();
        checkPlayerVehicleCollision();
        checkBarricadeVehicleCollision();

        // Move vehicles
        for (let i = vehicles.length - 1; i >= 0; i--) {
            const v = vehicles[i];
            const data = v.userData;
            if (!data.active) continue;

            // --- Dynamic Tile-Based Pathing ---
            // Check if we're approaching an intersection and need to read a tile
            const nextIntersection = findNextIntersection(
                { x: v.position.x, z: v.position.z },
                data.axis, data.dir, data.passedIntersections
            );

            if (nextIntersection && !data.isTurning) {
                const distToCenter = data.axis === 'z'
                    ? (nextIntersection.z - v.position.z) * data.dir
                    : (nextIntersection.x - v.position.x) * data.dir;

                // When we're close enough to the intersection center, read the tile and execute
                const turnTriggerDist = 2; // Distance to center where we commit to direction

                if (distToCenter < turnTriggerDist && distToCenter > -2) {
                    // Read the tile for this approach
                    const approachDir = getApproachDir(data.axis, data.dir);
                    const tile = findTileForApproach(nextIntersection.x, nextIntersection.z, approachDir);

                    const tileDirection = tile ? tile.userData.direction : 'straight';
                    const resolved = resolveTileDirection(tileDirection, data.axis, data.dir);

                    // Mark this intersection as passed
                    data.passedIntersections.push({ x: nextIntersection.x, z: nextIntersection.z });

                    if (tileDirection !== 'straight') {
                        // Execute turn
                        data.axis = resolved.axis;
                        data.dir = resolved.dir;

                        // Snap to lane center
                        if (data.axis === 'x') {
                            // Now moving horizontally, snap z to lane center
                            v.position.z = nextIntersection.z + (data.dir === 1 ? -roadWidthH / 4 : roadWidthH / 4);
                            v.rotation.y = data.dir === 1 ? Math.PI / 2 : -Math.PI / 2;
                        } else {
                            // Now moving vertically, snap x to lane center
                            v.position.x = nextIntersection.x + (data.dir === 1 ? roadWidthV / 4 : -roadWidthV / 4);
                            v.rotation.y = data.dir === 1 ? 0 : Math.PI;
                        }

                        // Update minimap blip reverse rotation
                        const minimapBlip = v.children.find(c => c.layers.test({ mask: 2 }));
                        if (minimapBlip) {
                            minimapBlip.rotation.y = -v.rotation.y;
                        }
                    }

                    // Turn blinkers off after passing
                    data.leftBlinker.material.visible = false;
                    data.rightBlinker.material.visible = false;
                }

                // Blinker logic: show blinkers when approaching intersection
                if (distToCenter > 0 && distToCenter < 35) {
                    const approachDir = getApproachDir(data.axis, data.dir);
                    const tile = findTileForApproach(nextIntersection.x, nextIntersection.z, approachDir);
                    const tileDir = tile ? tile.userData.direction : 'straight';

                    const isBlinkOn = (Date.now() % 600) < 300;
                    if (tileDir === 'left') {
                        data.leftBlinker.material.visible = isBlinkOn;
                        data.rightBlinker.material.visible = false;
                    } else if (tileDir === 'right') {
                        data.rightBlinker.material.visible = isBlinkOn;
                        data.leftBlinker.material.visible = false;
                    } else {
                        data.leftBlinker.material.visible = false;
                        data.rightBlinker.material.visible = false;
                    }
                }
            } else if (!nextIntersection) {
                // No more intersections ahead, ensure blinkers off
                data.leftBlinker.material.visible = false;
                data.rightBlinker.material.visible = false;
            }

            // --- Avoid rear-ending cars in the same lane ---
            let shouldStop = false;
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
                        const dist = (vB.position[data.axis] - v.position[data.axis]) * data.dir;
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
        mainCamera.position.y = 95 + (Math.random() - 0.5) * magnitude;
        mainCamera.position.z = 45 + (Math.random() - 0.5) * magnitude;
        shakeTime--;
    } else {
        mainCamera.position.set(0, 95, 45);
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

        // Reset direction tiles to 'straight'
        directionTiles.forEach(tileGroup => {
            const data = tileGroup.userData;
            // Reset to straight
            while (data.direction !== 'straight') {
                cycleTileDirection(tileGroup);
            }
        });

        // Reset player character
        playerHP = MAX_HP;
        playerInvincible = 0;
        player.position.set(0, 0, 0);
        player.visible = true;
        playerTarget = null;
        targetIndicator.visible = false;
        updateHPUI();

        // Clear barricades
        barricades.forEach(b => scene.remove(b));
        barricades.length = 0;
        updateBarricadeUI();
    });
}
