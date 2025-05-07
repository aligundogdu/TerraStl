<template>
  <div ref="previewContainer" class="preview-container">
    <div v-if="!props.terrainData && !props.isLoadingProps" class="placeholder">
      3D Önizleme için lütfen bir alan seçip "Render Et" butonuna tıklayın.
    </div>
    <div v-if="props.isLoadingProps" class="placeholder">3D Model Yükleniyor...</div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';

const props = defineProps({
  terrainData: { 
    type: Object,
    default: null
  },
  config: { 
    type: Object,
    default: () => ({})
  },
  isLoadingProps: { 
    type: Boolean,
    default: false
  }
});

const previewContainer = ref(null);
let scene, camera, renderer, controls, terrainMesh;

// --- Helper Function Definitions START ---

function clearThreeGroup(group) {
  if (!group) return;
  while (group.children.length > 0) {
    const object = group.children[0];
    if (object.geometry) {
      object.geometry.dispose();
    }
    if (object.material) {
      if (Array.isArray(object.material)) {
        object.material.forEach(m => m.dispose());
      } else {
        object.material.dispose();
      }
    }
    group.remove(object);
  }
}

function initThreeJS() {
  console.log('[Preview3D] LOG: initThreeJS called');
  if (!previewContainer.value) {
    console.error('[Preview3D] initThreeJS: previewContainer is null');
    return;
  }
  if (!previewContainer.value.clientWidth || !previewContainer.value.clientHeight) {
    console.error('[Preview3D] initThreeJS: previewContainer has zero dimensions.');
    return; 
  }

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf0f0f0);

  const aspect = previewContainer.value.clientWidth / previewContainer.value.clientHeight;
  camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 1000);
  camera.position.set(50, 50, 100); 
  camera.lookAt(scene.position);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(previewContainer.value.clientWidth, previewContainer.value.clientHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  previewContainer.value.appendChild(renderer.domElement);

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
  scene.add(ambientLight);
  
  const keyLight = new THREE.DirectionalLight(0xffffff, 0.9);
  keyLight.position.set(75, 150, 100);
  keyLight.castShadow = true;
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0xffffff, 0.35);
  fillLight.position.set(-75, 50, 50);
  scene.add(fillLight);
  
  const hemisphereLight = new THREE.HemisphereLight(0xffffbb, 0x080820, 0.45);
  scene.add(hemisphereLight);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.screenSpacePanning = true; 
  controls.minDistance = 10;
  controls.maxDistance = 800;

  animate();
  window.addEventListener('resize', onWindowResize);
  console.log('[Preview3D] LOG: initThreeJS finished successfully.');
}

function animate() {
  if (!renderer) return; 
  requestAnimationFrame(animate);
  if (controls) controls.update();
  if (scene && camera) renderer.render(scene, camera);
}

function onWindowResize() {
  if (!previewContainer.value || !renderer || !camera) return;
  if (previewContainer.value.clientWidth > 0 && previewContainer.value.clientHeight > 0) {
    camera.aspect = previewContainer.value.clientWidth / previewContainer.value.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(previewContainer.value.clientWidth, previewContainer.value.clientHeight);
  } else {
    console.warn('[Preview3D] onWindowResize: previewContainer has zero dimensions during resize.');
  }
}

function updateTerrainMesh() {
  console.log('[Preview3D] LOG: updateTerrainMesh CALLED.');
  
  if (!scene) {
    console.warn('[Preview3D] LOG: updateTerrainMesh: Scene not initialized yet.');
    return;
  } 
  if (terrainMesh) {
    scene.remove(terrainMesh);
    terrainMesh.geometry.dispose();
    if (terrainMesh.material) {
        if (Array.isArray(terrainMesh.material)) {
            terrainMesh.material.forEach(m => m.dispose());
        } else {
            terrainMesh.material.dispose();
        }
    }
    terrainMesh = null;
  }

  if (!props.terrainData || !props.terrainData.elevations || !props.config) {
    console.warn('[Preview3D] LOG: updateTerrainMesh: Missing terrainData, elevations, or config.');
    if (renderer && scene && camera) renderer.render(scene, camera); 
    return;
  }
  const { elevations, rows, cols } = props.terrainData;
  const { targetWidthMM, targetHeightMM, baseHeightMM, waterBaseHeightMM, verticalScale } = props.config;

  if (!elevations || elevations.length === 0 || rows <= 1 || cols <= 1 || !targetWidthMM || !targetHeightMM || !baseHeightMM) {
    console.warn('[Preview3D] LOG: updateTerrainMesh: Invalid or incomplete data for terrain mesh creation.');
    if (renderer && scene && camera) renderer.render(scene, camera); 
    return;
  }
  console.log('[Preview3D] LOG: updateTerrainMesh: Proceeding with terrain mesh generation.');

  const geometry = new THREE.BoxGeometry(targetWidthMM, baseHeightMM, targetHeightMM, cols - 1, 1, rows - 1);
  const vertices = geometry.attributes.position;

  let minElev = Infinity, maxElev = -Infinity;
  elevations.forEach(e => {
    if (e === null || typeof e === 'undefined') return;
    if (e < minElev) minElev = e;
    if (e > maxElev) maxElev = e;
  });
  if (minElev === Infinity) minElev = 0; 
  if (maxElev === -Infinity) maxElev = 0;
  if (minElev === maxElev && elevations.some(e => e !== null)) maxElev = minElev + 1; 
  else if (minElev === maxElev) { minElev = 0; maxElev = 1; } 
  
  const elevationRange = maxElev - minElev;

  for (let i = 0; i < vertices.count; i++) {
    const localY = vertices.getY(i);
    if (Math.abs(localY - (baseHeightMM / 2)) < 0.001) { 
      const localX = vertices.getX(i);
      const localZ = vertices.getZ(i);
      const u = (localX + targetWidthMM / 2) / targetWidthMM;
      const v = (localZ + targetHeightMM / 2) / targetHeightMM;
      let elevRow = Math.floor(v * (rows - 1));
      let elevCol = Math.floor(u * (cols - 1));
      elevRow = Math.max(0, Math.min(rows - 1, elevRow));
      elevCol = Math.max(0, Math.min(cols - 1, elevCol));
      const elevationIndex = elevRow * cols + elevCol;
      let currentElevation = elevations[elevationIndex];
      if (currentElevation === null || typeof currentElevation === 'undefined') {
        currentElevation = minElev;
      }
      let heightEffect = 0;
      if (elevationRange > 0.001) { 
        heightEffect = ((currentElevation - minElev) / elevationRange) * 10; 
      }
      heightEffect *= (verticalScale || 1.0); 
      vertices.setY(i, (baseHeightMM / 2) + heightEffect);
    }
  }

  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({
    color: 0xbbbbbb,
    roughness: 0.75,
    metalness: 0.1,
    side: THREE.DoubleSide,
    flatShading: false,
  });
  terrainMesh = new THREE.Mesh(geometry, material);
  terrainMesh.rotation.x = Math.PI / 2;
  scene.add(terrainMesh);
  
  const boundingBox = new THREE.Box3().setFromObject(terrainMesh);
  const center = new THREE.Vector3();
  boundingBox.getCenter(center);
  const size = new THREE.Vector3();
  boundingBox.getSize(size);

  let cameraDistance = Math.max(size.x, size.y, size.z) * 1.8;
  if (cameraDistance < 100) cameraDistance = 200;

  camera.position.x = center.x;
  camera.position.y = center.y - cameraDistance * 0.6;
  camera.position.z = center.z + cameraDistance * 0.8;
  
  camera.lookAt(center);
  
  if (controls) {
    controls.target.copy(center);
    controls.update();
  }
  console.log('[Preview3D] LOG: updateTerrainMesh: Mesh generated and camera updated.');
}

const exportSTL = () => {
  if (!terrainMesh) {
    console.warn('Preview3D: No mesh to export.');
    return null;
  }
  const exporter = new STLExporter();
  const stlData = exporter.parse(terrainMesh, { binary: true }); 
  return stlData;
};
// --- Helper Function Definitions END ---

defineExpose({ exportSTL });

onMounted(() => {
  console.log('[Preview3D] LOG: onMounted. Initial props -> isLoadingProps:', props.isLoadingProps, 'terrainData:', props.terrainData ? 'Exists' : 'null', 'config:', props.config ? 'Exists' : 'null');
  nextTick(() => {
    if (previewContainer.value && (!renderer)) {
      initThreeJS(); 
    }
  });
});

onUnmounted(() => {
  console.log('[Preview3D] LOG: onUnmounted called');
  window.removeEventListener('resize', onWindowResize);
  if (terrainMesh) {
    scene.remove(terrainMesh);
    terrainMesh.geometry.dispose();
    if (terrainMesh.material) {
      if (Array.isArray(terrainMesh.material)) {
          terrainMesh.material.forEach(m => m.dispose());
      } else {
          terrainMesh.material.dispose();
      }
    }
  }
  if (renderer) {
    console.log('[Preview3D] LOG: Disposing renderer');
    renderer.dispose();
    renderer.domElement.remove();
    renderer = null;
  }
  if (controls) {
    controls.dispose();
    controls = null;
  }
  if (scene) {
    console.log('[Preview3D] LOG: Disposing scene objects');
    scene = null;
  }
  camera = null;
  terrainMesh = null;
  console.log('[Preview3D] LOG: Cleanup finished.');
});

watch(() => props.terrainData, (newTerrainData, oldTerrainData) => {
  console.log('[Preview3D] WATCHER: terrainData changed.');
  if (newTerrainData && scene) {
    updateTerrainMesh();
  } else if (!newTerrainData && scene && terrainMesh) {
    scene.remove(terrainMesh);
    terrainMesh.geometry.dispose();
    if (terrainMesh.material) {
        if (Array.isArray(terrainMesh.material)) {
            terrainMesh.material.forEach(m => m.dispose());
        } else {
            terrainMesh.material.dispose();
        }
    }
    terrainMesh = null;
    if (renderer && scene && camera) renderer.render(scene, camera);
  }
}, { deep: true });

watch(() => props.config, (newConfig, oldConfig) => {
  console.log('[Preview3D] WATCHER: config changed.');
  if (props.terrainData && scene) {
    updateTerrainMesh();
  }
}, { deep: true });

watch(() => props.isLoadingProps, (newVal) => {
  console.log('[Preview3D] WATCHER: isLoadingProps changed to:', newVal);
  if (!newVal && scene) {
    if (props.terrainData && !terrainMesh) {
        console.log('[Preview3D] isLoadingProps changed, attempting to render terrain.');
        updateTerrainMesh();
    }
  }
});

</script>

<style scoped>
.preview-container {
  width: 100%;
  height: 500px;
  position: relative;
  background-color: #e0e0e0;
}
.placeholder {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  color: #555;
  font-size: 1.2em;
  text-align: center;
}
</style>